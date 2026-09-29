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
  triggerSync as triggerSyncApi,
  cancelSync as cancelSyncApi,
  deleteOfflineLogs as deleteOfflineLogsApi,
} from '../lib/offlineTauri';


interface SyncAttempt {
  hostId: string;
  syncEpoch: number;
  generation: number;
}

function ownsCurrentSync(state: OfflineStore, attempt: SyncAttempt | null): boolean {
  return (
    attempt !== null &&
    state.currentSyncAttempt?.hostId === attempt.hostId &&
    state.currentSyncAttempt.syncEpoch === attempt.syncEpoch &&
    state.currentSyncAttempt.generation === attempt.generation
  );
}

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
  /** Local attempt that owns optimistic current sync progress. */
  currentSyncAttempt: SyncAttempt | null;
  /** Monotonic generation assigned to locally initiated sync attempts. */
  nextSyncGeneration: number;
  /** Per-host invalidation generations for deleted sync work. */
  syncEpochs: Map<string, number>;
  /** Hosts whose stale progress events must not restore deleted state. */
  invalidatedSyncHosts: Set<string>;
  /** Sync generation that owns each deleted host's invalidation. */
  invalidatedSyncEpochs: Map<string, number>;
  /** Loading states */
  isLoadingSyncStates: boolean;
  isLoadingStorageStats: boolean;
  isLoadingSettings: boolean;
  /** Error states */
  syncStatesError: string | null;
  storageStatsError: string | null;
  settingsError: string | null;

  /** Set persisted frontend mode synchronously. */
  setOfflineMode: (offline: boolean) => void;
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
      currentSyncAttempt: null,
      nextSyncGeneration: 1,
      syncEpochs: new Map(),
      invalidatedSyncHosts: new Set(),
      invalidatedSyncEpochs: new Map(),
      isLoadingSyncStates: false,
      isLoadingStorageStats: false,
      isLoadingSettings: false,
      syncStatesError: null,
      storageStatsError: null,
      settingsError: null,

      setOfflineMode: (offline: boolean) => {
        set({ isOfflineMode: offline });
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
        const currentState = get().syncStates.get(hostId);
        const syncEpoch = get().syncEpochs.get(hostId) ?? 0;
        const activeSync = get().currentSync;
        const concurrentSyncIsActive =
          activeSync?.status === 'starting' || activeSync?.status === 'fetching';
        let attempt: SyncAttempt | null = null;
        if (!concurrentSyncIsActive) {
          attempt = {
            hostId,
            syncEpoch,
            generation: get().nextSyncGeneration,
          };
          const newSyncStates = new Map(get().syncStates);
          newSyncStates.set(hostId, {
            hostId,
            lastSyncTimestamp: currentState?.lastSyncTimestamp ?? 0,
            lastCursor: currentState?.lastCursor ?? null,
            syncStatus: 'in_progress',
            syncError: null,
            entriesSynced: currentState?.entriesSynced ?? 0,
          });
          set({
            syncStates: newSyncStates,
            currentSync: {
              hostId,
              status: 'starting',
              entriesSynced: 0,
              totalEntries: currentState?.entriesSynced ?? 0,
              batchSize: 0,
              error: null,
            },
            currentSyncAttempt: attempt,
            nextSyncGeneration: attempt.generation + 1,
          });
        }

        try {
          const result = await triggerSyncApi(hostId);

          if ((get().syncEpochs.get(hostId) ?? 0) !== syncEpoch) {
            const state = get();
            const invalidatedSyncHosts = new Set(state.invalidatedSyncHosts);
            const invalidatedSyncEpochs = new Map(state.invalidatedSyncEpochs);
            if (invalidatedSyncEpochs.get(hostId) === syncEpoch) {
              invalidatedSyncHosts.delete(hostId);
              invalidatedSyncEpochs.delete(hostId);
            }
            const attemptOwnsProgress = ownsCurrentSync(state, attempt);
            set({
              currentSync: attemptOwnsProgress ? null : state.currentSync,
              currentSyncAttempt: attemptOwnsProgress ? null : state.currentSyncAttempt,
              invalidatedSyncHosts,
              invalidatedSyncEpochs,
            });
            return result;
          }

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
          const state = get();
          const attemptOwnsProgress = ownsCurrentSync(state, attempt);
          set({
            syncStates: updatedStates,
            currentSync: attemptOwnsProgress ? null : state.currentSync,
            currentSyncAttempt: attemptOwnsProgress ? null : state.currentSyncAttempt,
          });

          // Reload storage stats after sync
          await get().loadStorageStats();

          return result;
        } catch (error) {
          if ((get().syncEpochs.get(hostId) ?? 0) !== syncEpoch) {
            const state = get();
            const invalidatedSyncHosts = new Set(state.invalidatedSyncHosts);
            const invalidatedSyncEpochs = new Map(state.invalidatedSyncEpochs);
            if (invalidatedSyncEpochs.get(hostId) === syncEpoch) {
              invalidatedSyncHosts.delete(hostId);
              invalidatedSyncEpochs.delete(hostId);
            }
            const attemptOwnsProgress = ownsCurrentSync(state, attempt);
            set({
              currentSync: attemptOwnsProgress ? null : state.currentSync,
              currentSyncAttempt: attemptOwnsProgress ? null : state.currentSyncAttempt,
              invalidatedSyncHosts,
              invalidatedSyncEpochs,
            });
            throw error;
          }
          const message = error instanceof Error ? error.message : String(error);

          // The backend rejected a second start. Its active worker owns the
          // current progress, so neither replace nor clear it locally.
          if (concurrentSyncIsActive && message.includes('A sync is already running.')) {
            throw error;
          }

          // Update sync state to failed
          const updatedStates = new Map(get().syncStates);
          updatedStates.set(hostId, {
            hostId,
            lastSyncTimestamp: currentState?.lastSyncTimestamp ?? 0,
            lastCursor: currentState?.lastCursor ?? null,
            syncStatus: 'failed',
            syncError: message,
            entriesSynced: currentState?.entriesSynced ?? 0,
          });
          const state = get();
          const attemptOwnsProgress = ownsCurrentSync(state, attempt);
          set({
            syncStates: updatedStates,
            currentSync: attemptOwnsProgress ? null : state.currentSync,
            currentSyncAttempt: attemptOwnsProgress ? null : state.currentSyncAttempt,
          });
          throw error;
        }
      },

      cancelSync: async (hostId: string) => {
        await cancelSyncApi(hostId);
        // The sync state will be updated when the sync-progress event fires with cancelled status
      },

      deleteOfflineLogs: async (hostId: string) => {
        const state = get();
        const syncEpochs = new Map(state.syncEpochs);
        const syncEpoch = syncEpochs.get(hostId) ?? 0;
        const deletionEpoch = syncEpoch + 1;
        syncEpochs.set(hostId, deletionEpoch);
        const invalidatedSyncHosts = new Set(state.invalidatedSyncHosts);
        const invalidatedSyncEpochs = new Map(state.invalidatedSyncEpochs);
        invalidatedSyncHosts.add(hostId);
        const syncIsActive =
          state.currentSync?.hostId === hostId &&
          (state.currentSync.status === 'starting' || state.currentSync.status === 'fetching');
        if (syncIsActive && !invalidatedSyncEpochs.has(hostId)) {
          invalidatedSyncEpochs.set(hostId, syncEpoch);
        }
        set({ syncEpochs, invalidatedSyncHosts, invalidatedSyncEpochs });

        try {
          const deleted = await deleteOfflineLogsApi(hostId);

          // Update storage stats using the current state. A stale worker may
          // complete while deletion is in flight and release its invalidation.
          const state = get();
          const newStorageStats = new Map(state.storageStats);
          newStorageStats.delete(hostId);

          // Reset sync state for this host
          const newSyncStates = new Map(state.syncStates);
          newSyncStates.set(hostId, {
            hostId,
            lastSyncTimestamp: 0,
            lastCursor: null,
            syncStatus: 'never',
            syncError: null,
            entriesSynced: 0,
          });

          const currentInvalidatedSyncHosts = new Set(state.invalidatedSyncHosts);
          const currentInvalidatedSyncEpochs = new Map(state.invalidatedSyncEpochs);
          const syncIsStillActive =
            state.currentSync?.hostId === hostId &&
            (state.currentSync.status === 'starting' || state.currentSync.status === 'fetching');
          const invalidationHasActiveOwner =
            syncIsStillActive && currentInvalidatedSyncEpochs.has(hostId);
          if (
            !invalidationHasActiveOwner &&
            (state.syncEpochs.get(hostId) ?? 0) === deletionEpoch
          ) {
            currentInvalidatedSyncHosts.delete(hostId);
            currentInvalidatedSyncEpochs.delete(hostId);
          }
          set({
            storageStats: newStorageStats,
            syncStates: newSyncStates,
            invalidatedSyncHosts: currentInvalidatedSyncHosts,
            invalidatedSyncEpochs: currentInvalidatedSyncEpochs,
          });
          return deleted;
        } catch (error) {
          const state = get();
          if ((state.syncEpochs.get(hostId) ?? 0) === deletionEpoch) {
            const invalidatedSyncHosts = new Set(state.invalidatedSyncHosts);
            const invalidatedSyncEpochs = new Map(state.invalidatedSyncEpochs);
            invalidatedSyncHosts.delete(hostId);
            invalidatedSyncEpochs.delete(hostId);
            set({ invalidatedSyncHosts, invalidatedSyncEpochs });
          }
          throw error;
        }
      },

      updateSyncProgress: (progress: SyncProgressEvent | null) => {
        const state = get();
        if (progress && state.invalidatedSyncHosts.has(progress.hostId)) {
          return;
        }
        set({
          currentSync: progress,
          currentSyncAttempt:
            progress && state.currentSyncAttempt?.hostId === progress.hostId
              ? state.currentSyncAttempt
              : null,
        });
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
