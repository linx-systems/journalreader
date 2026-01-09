import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useScrollSyncStore } from '../stores/scrollSyncStore';
import { queryJournal, queryRemoteJournal } from '../lib/tauri';
import { queryOfflineJournal } from '../lib/offlineTauri';
import { filtersEqual } from '../lib/types';

/**
 * Check if an error is a connection-related error that should trigger offline fallback.
 */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('unreachable') ||
    message.includes('offline') ||
    message.includes('ssh') ||
    message.includes('failed to connect')
  );
}

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

  // Determine if the active tab is a remote host
  const isActiveTabRemote = activeTabId !== LOCAL_TAB_ID;
  // Determine if we're connected to the active remote host
  const isConnectedToActiveTab = isActiveTabRemote && connectedHostId === activeTabId && connectionStatus === 'connected';
  // Legacy isRemote for backward compatibility
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;
  // Determine if we're effectively offline - only applies when viewing a remote host tab
  // Local logs are always available directly, they don't need offline mode
  const isEffectivelyOffline = isActiveTabRemote && (isOfflineMode || !isConnectedToActiveTab);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs to access current values without causing effect re-runs
  const filterRef = useRef(filter);
  const cursorEndRef = useRef(cursorEnd);
  const isConnectedToActiveTabRef = useRef(isConnectedToActiveTab);
  const isEffectivelyOfflineRef = useRef(isEffectivelyOffline);
  const activeTabIdRef = useRef(activeTabId);
  const isActiveTabRemoteRef = useRef(isActiveTabRemote);
  filterRef.current = filter;
  cursorEndRef.current = cursorEnd;
  isConnectedToActiveTabRef.current = isConnectedToActiveTab;
  isEffectivelyOfflineRef.current = isEffectivelyOffline;
  activeTabIdRef.current = activeTabId;
  isActiveTabRemoteRef.current = isActiveTabRemote;

  // Track sync-adjusted filter for tab switches (declared before fetchLogs so it can be used)
  const syncAdjustedFilterRef = useRef<{ since?: string } | null>(null);

  const fetchLogs = useCallback(async (append = false) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const currentFilter = filterRef.current;
      const currentCursorEnd = cursorEndRef.current;
      const currentIsOffline = isEffectivelyOfflineRef.current;
      const currentActiveTabId = activeTabIdRef.current;
      const currentIsActiveTabRemote = isActiveTabRemoteRef.current;
      const currentIsConnectedToActiveTab = isConnectedToActiveTabRef.current;

      // Apply sync-adjusted filter if available (for tab switches with scroll sync)
      let baseFilter = currentFilter;
      if (syncAdjustedFilterRef.current && !append) {
        baseFilter = { ...currentFilter, ...syncAdjustedFilterRef.current };
        // Clear after use - only applies to the first fetch after tab switch
        syncAdjustedFilterRef.current = null;
      }

      const filterToUse = append && currentCursorEnd
        ? { ...baseFilter, afterCursor: currentCursorEnd }
        : baseFilter;

      let result;
      if (currentIsOffline) {
        // Query offline storage when in offline mode or not connected to active remote tab
        result = await queryOfflineJournal(currentActiveTabId, filterToUse);
      } else if (currentIsActiveTabRemote && currentIsConnectedToActiveTab) {
        // Query remote host when connected to the active tab's host
        result = await queryRemoteJournal(filterToUse);
      } else {
        // Query local journal when viewing local tab
        result = await queryJournal(filterToUse);
      }

      if (append) {
        appendEntries(result.entries);
      } else {
        setEntries(result.entries);
      }

      setHasMore(result.hasMore);
      setCursorEnd(result.cursorEnd ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Auto-fallback: if remote query fails with connection error, switch to offline mode
      const currentIsOffline = isEffectivelyOfflineRef.current;
      const currentActiveTabId = activeTabIdRef.current;
      if (!currentIsOffline && isConnectionError(err)) {
        try {
          await setOfflineMode(true);
          const currentFilter = filterRef.current;
          const currentCursorEnd = cursorEndRef.current;
          const filterToUse = append && currentCursorEnd
            ? { ...currentFilter, afterCursor: currentCursorEnd }
            : currentFilter;
          const result = await queryOfflineJournal(currentActiveTabId, filterToUse);

          if (append) {
            appendEntries(result.entries);
          } else {
            setEntries(result.entries);
          }

          setHasMore(result.hasMore);
          setCursorEnd(result.cursorEnd ?? null);
          return; // Success after fallback
        } catch (fallbackErr) {
          // Fallback also failed, report original error
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchLogs(true);
    }
  }, [isLoading, hasMore, fetchLogs]);

  const refresh = useCallback(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Track if we were previously in follow mode
  const wasFollowingRef = useRef(isFollowing);
  // Track the filter for comparison (to detect actual filter changes)
  // Initialize to null so the first render triggers an initial fetch
  const prevFilterRef = useRef<typeof filter | null>(null);
  // Track active tab to refresh when it changes
  const prevActiveTabIdRef = useRef(activeTabId);
  // Track offline mode to refresh when it changes
  const prevIsOfflineModeRef = useRef(isOfflineMode);

  // Refresh when active tab changes - this is the primary trigger for tab switching
  useEffect(() => {
    if (prevActiveTabIdRef.current !== activeTabId) {
      prevActiveTabIdRef.current = activeTabId;
      // Clear entries and fetch fresh data from the new tab's source
      setEntries([]);
      setCursorEnd(null);

      // If scroll sync is enabled and we have an anchor timestamp,
      // adjust the filter to ensure we load entries around that timestamp
      if (syncEnabled && anchorTimestamp !== null) {
        // Convert microseconds to Date, then to ISO string for the 'since' filter
        // Go back a bit from the anchor to ensure we have context
        const anchorDate = new Date(anchorTimestamp / 1000);
        // Load entries from 5 minutes before the anchor timestamp
        const sinceDate = new Date(anchorDate.getTime() - 5 * 60 * 1000);
        const sinceIso = sinceDate.toISOString();

        // Store the sync-adjusted since so fetchLogs can use it
        syncAdjustedFilterRef.current = { since: sinceIso };
      } else {
        syncAdjustedFilterRef.current = null;
      }

      fetchLogs(false);
    }
  }, [activeTabId, setEntries, setCursorEnd, fetchLogs, syncEnabled, anchorTimestamp]);

  // Refresh when offline mode changes
  useEffect(() => {
    if (prevIsOfflineModeRef.current !== isOfflineMode) {
      prevIsOfflineModeRef.current = isOfflineMode;
      // Clear entries and fetch fresh data from the appropriate source
      setEntries([]);
      setCursorEnd(null);
      fetchLogs(false);
    }
  }, [isOfflineMode, setEntries, setCursorEnd, fetchLogs]);

  // Debounced fetch when filter changes (skip if in follow mode)
  useEffect(() => {
    // If we just exited follow mode, fetch immediately
    if (wasFollowingRef.current && !isFollowing) {
      wasFollowingRef.current = false;
      prevFilterRef.current = filter;
      fetchLogs(false);
      return;
    }
    wasFollowingRef.current = isFollowing;

    // Don't fetch when in follow mode - the follow mode handles its own data
    if (isFollowing) {
      return;
    }

    // Check if this is the initial load (prevFilterRef is null)
    const isInitialLoad = prevFilterRef.current === null;

    // Only fetch if filter actually changed (not just reference)
    // Uses efficient shallow comparison instead of O(n) JSON.stringify
    if (filtersEqual(prevFilterRef.current, filter) && !isInitialLoad) {
      return;
    }
    prevFilterRef.current = filter;

    // On initial load, fetch immediately without debounce
    if (isInitialLoad) {
      fetchLogs(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchLogs(false);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filter, isFollowing, fetchLogs]);

  return {
    entries,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
