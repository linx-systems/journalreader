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
  const { connectedHostId } = useConnectionStore();
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

  // The persisted store is the sole authority for offline mode.
  const isOffline = isOfflineMode;
  // The native reservation is process-wide, so every start control must
  // reflect the active run regardless of the selected host.
  const isSyncing =
    currentSync?.status === 'starting' || currentSync?.status === 'fetching';

  // Get last sync timestamp for current host
  const lastSyncTime = syncState?.lastSyncTimestamp ?? null;

  // Trigger sync for current host
  const startSync = useCallback(async () => {
    if (effectiveHostId === 'local') {
      throw new Error('Cannot sync local host');
    }
    return triggerSync(effectiveHostId);
  }, [effectiveHostId, triggerSync]);

  // A host switch must not hide the active run's cancellation action.
  const stopSync = useCallback(async () => {
    await cancelSync(currentSync?.hostId ?? effectiveHostId);
  }, [cancelSync, currentSync?.hostId, effectiveHostId]);

  return {
    /** Sync state for the current host */
    syncState,
    /** Whether the app is in explicit offline mode */
    isOffline,
    isSyncing,
    /** Last successful sync timestamp for the current host (null if never synced) */
    lastSyncTime,
    /** Current sync progress event (null if not syncing) */
    currentProgress: currentSync,
    /** Host ID being tracked */
    hostId: effectiveHostId,
    /** Start syncing for the current host */
    startSync,
    /** Cancel the process-wide active sync, if any */
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
