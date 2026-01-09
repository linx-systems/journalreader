import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useScrollSyncStore } from '../stores/scrollSyncStore';
import { useJournalFetch, type JournalRefs } from './useJournalFetch';
import { useFilterDebounce } from './useFilterDebounce';
import { useTabSync } from './useTabSync';

/**
 * Main hook for fetching journal logs in the primary view.
 *
 * This hook composes several smaller, focused hooks:
 * - useJournalFetch: Core fetching logic with offline fallback
 * - useFilterDebounce: Debounced filter change handling
 * - useTabSync: Tab switching synchronization with scroll sync
 *
 * @returns Journal entries, loading state, error state, and control functions
 */
export function useJournalLogs() {
  const {
    filter,
    entries,
    isLoading,
    error,
    hasMore,
    cursorEnd,
    isFollowing,
    setEntries,
    appendEntries,
    setLoading,
    setError,
    setHasMore,
    setCursorEnd,
  } = useFilterStore();

  const { connectedHostId, connectionStatus, activeTabId } = useConnectionStore();
  const { isOfflineMode, setOfflineMode } = useOfflineStore();
  const { syncEnabled, anchorTimestamp } = useScrollSyncStore();

  // Compute data source state
  const isActiveTabRemote = activeTabId !== LOCAL_TAB_ID;
  const isConnectedToActiveTab = isActiveTabRemote && connectedHostId === activeTabId && connectionStatus === 'connected';
  const isEffectivelyOffline = isActiveTabRemote && (isOfflineMode || !isConnectedToActiveTab);

  // Track sync-adjusted filter for tab switches
  const syncAdjustedFilterRef = useRef<{ since?: string } | null>(null);

  // Refs for accessing current values without triggering effect re-runs
  const refsRef = useRef<JournalRefs>({
    filter,
    cursorEnd,
    dataSource: {
      hostId: activeTabId,
      isRemote: isActiveTabRemote,
      isConnected: isConnectedToActiveTab,
      isOffline: isEffectivelyOffline,
    },
    syncAdjustedFilter: syncAdjustedFilterRef.current,
  });

  // Keep refs up to date
  refsRef.current = {
    filter,
    cursorEnd,
    dataSource: {
      hostId: activeTabId,
      isRemote: isActiveTabRemote,
      isConnected: isConnectedToActiveTab,
      isOffline: isEffectivelyOffline,
    },
    syncAdjustedFilter: syncAdjustedFilterRef.current,
  };

  // Core fetch logic
  const { fetchLogs, loadMore: fetchLoadMore, refresh } = useJournalFetch({
    actions: {
      setEntries,
      appendEntries,
      setLoading,
      setError,
      setHasMore,
      setCursorEnd,
      setOfflineMode,
    },
    refs: refsRef,
    onSyncFilterUsed: useCallback(() => {
      syncAdjustedFilterRef.current = null;
    }, []),
  });

  // Guarded loadMore that checks state
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchLoadMore();
    }
  }, [isLoading, hasMore, fetchLoadMore]);

  // Handle tab switching with scroll sync
  const handleClearEntries = useCallback(() => {
    setEntries([]);
    setCursorEnd(null);
  }, [setEntries, setCursorEnd]);

  const handleTabFetch = useCallback((syncAdjustedSince: string | null) => {
    syncAdjustedFilterRef.current = syncAdjustedSince ? { since: syncAdjustedSince } : null;
    fetchLogs(false);
  }, [fetchLogs]);

  useTabSync({
    activeTabId,
    syncEnabled,
    anchorTimestamp,
    onClearEntries: handleClearEntries,
    onFetch: handleTabFetch,
  });

  // Handle offline mode changes
  const prevIsOfflineModeRef = useRef(isOfflineMode);
  useEffect(() => {
    if (prevIsOfflineModeRef.current !== isOfflineMode) {
      prevIsOfflineModeRef.current = isOfflineMode;
      setEntries([]);
      setCursorEnd(null);
      fetchLogs(false);
    }
  }, [isOfflineMode, setEntries, setCursorEnd, fetchLogs]);

  // Handle filter changes with debouncing
  useFilterDebounce({
    filter,
    isPaused: isFollowing,
    onFilterChange: useCallback(() => fetchLogs(false), [fetchLogs]),
    onResume: useCallback(() => fetchLogs(false), [fetchLogs]),
  });

  return {
    entries,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
