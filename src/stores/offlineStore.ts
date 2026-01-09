import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  SyncState,
  StorageStats,
  OfflineSettings,
  SyncResult,
  SyncProgressEvent,
} from '../lib/offlineTypes';
import { DEFAULT_OFFLINE_SETTINGS } from '../lib/offlineTypes';
import {
  getAllSyncStates,
  getAllStorageStats,
  getOfflineSettings as getOfflineSettingsApi,
  updateOfflineSettings as updateOfflineSettingsApi,
  isOfflineMode as isOfflineModeApi,
  setOfflineMode as setOfflineModeApi,
  triggerSync as triggerSyncApi,
  cancelSync as cancelSyncApi,
  deleteOfflineLogs as deleteOfflineLogsApi,
} from '../lib/offlineTauri';

interface OfflineStore {
  // State
  /** Whether the app is in offline mode */
  isOfflineMode: boolean;
  /** Sync state for each host (keyed by hostId) */
  syncStates: Map<string, SyncState>;
  /** Storage statistics for each host (keyed by hostId) */
  storageStats: Map<string, StorageStats>;
  /** Global offline settings */
  settings: OfflineSettings;
  /** Current sync progress (null if no sync in progress) */
  currentSync: SyncProgressEvent | null;
  /** Loading states */
  isLoadingSyncStates: boolean;
  isLoadingStorageStats: boolean;
  isLoadingSettings: boolean;
  /** Error states */
  syncStatesError: string | null;
  storageStatsError: string | null;
  settingsError: string | null;

  // Actions
  /** Set offline mode */
  setOfflineMode: (offline: boolean) => Promise<void>;
  /** Load sync states from backend */
  loadSyncStates: () => Promise<void>;
  /** Load storage statistics from backend */
  loadStorageStats: () => Promise<void>;
  /** Load offline settings from backend */
  loadSettings: () => Promise<void>;
  /** Update offline settings */
  updateSettings: (settings: OfflineSettings) => Promise<void>;
  /** Trigger sync for a specific host */
  triggerSync: (hostId: string) => Promise<SyncResult>;
  /** Cancel sync for a specific host */
  cancelSync: (hostId: string) => Promise<void>;
  /** Delete offline logs for a specific host */
  deleteOfflineLogs: (hostId: string) => Promise<number>;
  /** Update current sync progress (called from event listener) */
  updateSyncProgress: (progress: SyncProgressEvent | null) => void;
  /** Update sync state for a host (called from event listener) */
  updateSyncState: (hostId: string, state: Partial<SyncState>) => void;
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isOfflineMode: false,
      syncStates: new Map(),
      storageStats: new Map(),
      settings: DEFAULT_OFFLINE_SETTINGS,
      currentSync: null,
      isLoadingSyncStates: false,
      isLoadingStorageStats: false,
      isLoadingSettings: false,
      syncStatesError: null,
      storageStatsError: null,
      settingsError: null,

      setOfflineMode: async (offline: boolean) => {
        try {
          await setOfflineModeApi(offline);
          set({ isOfflineMode: offline });
        } catch (error) {
          // Still update local state on error for optimistic update reversal
          const wasOffline = await isOfflineModeApi().catch(() => get().isOfflineMode);
          set({ isOfflineMode: wasOffline });
          throw error;
        }
      },

      loadSyncStates: async () => {
        set({ isLoadingSyncStates: true, syncStatesError: null });
        try {
          const states = await getAllSyncStates();
          const syncStates = new Map<string, SyncState>();
          for (const state of states) {
            syncStates.set(state.hostId, state);
          }
          set({ syncStates, isLoadingSyncStates: false });
        } catch (error) {
          set({
            syncStatesError: error instanceof Error ? error.message : String(error),
            isLoadingSyncStates: false,
          });
        }
      },

      loadStorageStats: async () => {
        set({ isLoadingStorageStats: true, storageStatsError: null });
        try {
          const stats = await getAllStorageStats();
          const storageStats = new Map<string, StorageStats>();
          for (const stat of stats) {
            storageStats.set(stat.hostId, stat);
          }
          set({ storageStats, isLoadingStorageStats: false });
        } catch (error) {
          set({
            storageStatsError: error instanceof Error ? error.message : String(error),
            isLoadingStorageStats: false,
          });
        }
      },

      loadSettings: async () => {
        set({ isLoadingSettings: true, settingsError: null });
        try {
          const settings = await getOfflineSettingsApi();
          set({ settings, isLoadingSettings: false });
        } catch (error) {
          set({
            settingsError: error instanceof Error ? error.message : String(error),
            isLoadingSettings: false,
          });
        }
      },

      updateSettings: async (settings: OfflineSettings) => {
        try {
          await updateOfflineSettingsApi(settings);
          set({ settings });
        } catch (error) {
          // Reload settings on error
          await get().loadSettings();
          throw error;
        }
      },

      triggerSync: async (hostId: string) => {
        // Update local sync state to in_progress
        const { syncStates } = get();
        const currentState = syncStates.get(hostId);
        const newSyncStates = new Map(syncStates);
        newSyncStates.set(hostId, {
          hostId,
          lastSyncTimestamp: currentState?.lastSyncTimestamp ?? 0,
          lastCursor: currentState?.lastCursor ?? null,
          syncStatus: 'in_progress',
          syncError: null,
          entriesSynced: currentState?.entriesSynced ?? 0,
        });
        set({ syncStates: newSyncStates });

        try {
          const result = await triggerSyncApi(hostId);

          // Update sync state based on result
          const updatedStates = new Map(get().syncStates);
          updatedStates.set(hostId, {
            hostId,
            lastSyncTimestamp: result.success ? Date.now() : (currentState?.lastSyncTimestamp ?? 0),
            lastCursor: currentState?.lastCursor ?? null,
            syncStatus: result.success ? 'completed' : (result.cancelled ? 'never' : 'failed'),
            syncError: result.error,
            entriesSynced: result.totalEntries,
          });
          set({ syncStates: updatedStates, currentSync: null });

          // Reload storage stats after sync
          await get().loadStorageStats();

          return result;
        } catch (error) {
          // Update sync state to failed
          const updatedStates = new Map(get().syncStates);
          updatedStates.set(hostId, {
            hostId,
            lastSyncTimestamp: currentState?.lastSyncTimestamp ?? 0,
            lastCursor: currentState?.lastCursor ?? null,
            syncStatus: 'failed',
            syncError: error instanceof Error ? error.message : String(error),
            entriesSynced: currentState?.entriesSynced ?? 0,
          });
          set({ syncStates: updatedStates, currentSync: null });
          throw error;
        }
      },

      cancelSync: async (hostId: string) => {
        await cancelSyncApi(hostId);
        // The sync state will be updated when the sync-progress event fires with cancelled status
      },

      deleteOfflineLogs: async (hostId: string) => {
        const deleted = await deleteOfflineLogsApi(hostId);

        // Update storage stats
        const { storageStats, syncStates } = get();
        const newStorageStats = new Map(storageStats);
        newStorageStats.delete(hostId);

        // Reset sync state for this host
        const newSyncStates = new Map(syncStates);
        newSyncStates.set(hostId, {
          hostId,
          lastSyncTimestamp: 0,
          lastCursor: null,
          syncStatus: 'never',
          syncError: null,
          entriesSynced: 0,
        });

        set({ storageStats: newStorageStats, syncStates: newSyncStates });
        return deleted;
      },

      updateSyncProgress: (progress: SyncProgressEvent | null) => {
        set({ currentSync: progress });

        // Also update the sync state for the host if progress is provided
        if (progress) {
          const { syncStates } = get();
          const currentState = syncStates.get(progress.hostId);
          const newSyncStates = new Map(syncStates);

          let syncStatus: SyncState['syncStatus'] = 'in_progress';
          if (progress.status === 'completed') syncStatus = 'completed';
          else if (progress.status === 'cancelled') syncStatus = 'never';
          else if (progress.status === 'error') syncStatus = 'failed';

          newSyncStates.set(progress.hostId, {
            hostId: progress.hostId,
            lastSyncTimestamp: progress.status === 'completed' ? Date.now() : (currentState?.lastSyncTimestamp ?? 0),
            lastCursor: currentState?.lastCursor ?? null,
            syncStatus,
            syncError: progress.error,
            entriesSynced: progress.totalEntries,
          });
          set({ syncStates: newSyncStates });
        }
      },

      updateSyncState: (hostId: string, state: Partial<SyncState>) => {
        const { syncStates } = get();
        const currentState = syncStates.get(hostId);
        const newSyncStates = new Map(syncStates);
        newSyncStates.set(hostId, {
          hostId,
          lastSyncTimestamp: state.lastSyncTimestamp ?? currentState?.lastSyncTimestamp ?? 0,
          lastCursor: state.lastCursor ?? currentState?.lastCursor ?? null,
          syncStatus: state.syncStatus ?? currentState?.syncStatus ?? 'never',
          syncError: state.syncError ?? currentState?.syncError ?? null,
          entriesSynced: state.entriesSynced ?? currentState?.entriesSynced ?? 0,
        });
        set({ syncStates: newSyncStates });
      },
    }),
    {
      name: 'journal-reader-offline',
      partialize: (state) => ({
        // Only persist offline mode and settings
        isOfflineMode: state.isOfflineMode,
        settings: state.settings,
      }),
      // Custom storage to handle Map serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            // Migrate old settings format to new format
            if (parsed?.state?.settings) {
              const settings = parsed.state.settings;
              // If old format (has retentionDays but no syncBoots), migrate
              if (settings.retentionDays !== undefined && settings.syncBoots === undefined) {
                settings.syncBoots = DEFAULT_OFFLINE_SETTINGS.syncBoots;
                delete settings.retentionDays;
                delete settings.maxEntries;
              }
            }
            return parsed;
          } catch (e) {
            console.error('Failed to parse stored offline state, using defaults:', e);
            return null;
          }
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
