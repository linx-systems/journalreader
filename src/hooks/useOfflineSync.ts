import { useEffect, useCallback } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useConnectionStore } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import type {
  SyncProgressEvent,
  SyncCompletedEvent,
  SyncFailedEvent,
} from '../lib/offlineTypes';

// Global state to track if listeners are set up (singleton pattern)
let listenersSetUp = false;
let globalUnlistenProgress: UnlistenFn | null = null;
let globalUnlistenCompleted: UnlistenFn | null = null;
let globalUnlistenFailed: UnlistenFn | null = null;

async function setupListeners(
  updateSyncProgress: (progress: SyncProgressEvent | null) => void,
  loadSyncStates: () => Promise<void>,
  loadStorageStats: () => Promise<void>
) {
  if (listenersSetUp) return;
  listenersSetUp = true;

  globalUnlistenProgress = await listen<SyncProgressEvent>(
    'sync-progress',
    (event) => {
      updateSyncProgress(event.payload);
    }
  );

  globalUnlistenCompleted = await listen<SyncCompletedEvent>(
    'sync-completed',
    async () => {
      updateSyncProgress(null);
      // Reload sync states and storage stats after sync completes
      await Promise.all([loadSyncStates(), loadStorageStats()]);
    }
  );

  globalUnlistenFailed = await listen<SyncFailedEvent>(
    'sync-failed',
    async () => {
      updateSyncProgress(null);
      // Reload sync states after sync fails
      await loadSyncStates();
    }
  );
}

function cleanupListeners() {
  if (globalUnlistenProgress) {
    globalUnlistenProgress();
    globalUnlistenProgress = null;
  }
  if (globalUnlistenCompleted) {
    globalUnlistenCompleted();
    globalUnlistenCompleted = null;
  }
  if (globalUnlistenFailed) {
    globalUnlistenFailed();
    globalUnlistenFailed = null;
  }
  listenersSetUp = false;
}

/**
 * Hook for managing offline sync state and event listening.
 * Sets up listeners for sync-progress, sync-completed, and sync-failed events
 * from the Tauri backend and provides sync state for the current host.
 */
export function useOfflineSync() {
  const { connectedHostId, connectionStatus } = useConnectionStore();
  const {
    isOfflineMode,
    syncStates,
    currentSync,
    updateSyncProgress,
    loadSyncStates,
    loadStorageStats,
    triggerSync,
    cancelSync,
  } = useOfflineStore();

  // Set up event listeners on mount
  useEffect(() => {
    setupListeners(updateSyncProgress, loadSyncStates, loadStorageStats);

    return () => {
      cleanupListeners();
    };
  }, [updateSyncProgress, loadSyncStates, loadStorageStats]);

  // Get the effective host ID (connected host or 'local')
  const effectiveHostId = connectedHostId ?? 'local';

  // Get sync state for the current host
  const syncState = syncStates.get(effectiveHostId);

  // Determine if we're effectively offline
  const isOffline = isOfflineMode || connectionStatus !== 'connected';

  // Check if currently syncing (either globally or for current host)
  const isSyncing = currentSync !== null && currentSync.hostId === effectiveHostId;

  // Get last sync timestamp for current host
  const lastSyncTime = syncState?.lastSyncTimestamp ?? null;

  // Trigger sync for current host
  const startSync = useCallback(async () => {
    if (effectiveHostId === 'local') {
      throw new Error('Cannot sync local host');
    }
    return triggerSync(effectiveHostId);
  }, [effectiveHostId, triggerSync]);

  // Cancel sync for current host
  const stopSync = useCallback(async () => {
    await cancelSync(effectiveHostId);
  }, [effectiveHostId, cancelSync]);

  return {
    /** Sync state for the current host */
    syncState,
    /** Whether the app is in offline mode (explicit or disconnected) */
    isOffline,
    /** Whether a sync is currently in progress for the current host */
    isSyncing,
    /** Last successful sync timestamp for the current host (null if never synced) */
    lastSyncTime,
    /** Current sync progress event (null if not syncing) */
    currentProgress: currentSync,
    /** Current host ID being tracked */
    hostId: effectiveHostId,
    /** Start syncing for the current host */
    startSync,
    /** Cancel ongoing sync for the current host */
    stopSync,
  };
}

/**
 * Reset listener state for testing purposes.
 * Should only be called in test environments.
 */
export function _resetListenersForTesting() {
  cleanupListeners();
}
