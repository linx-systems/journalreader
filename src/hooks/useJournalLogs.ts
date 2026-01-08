import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
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

  const { connectedHostId, connectionStatus } = useConnectionStore();
  const { isOfflineMode, setOfflineMode } = useOfflineStore();
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;
  // Determine if we're effectively offline (explicit mode or disconnected)
  const isEffectivelyOffline = isOfflineMode || connectionStatus !== 'connected';

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs to access current values without causing effect re-runs
  const filterRef = useRef(filter);
  const cursorEndRef = useRef(cursorEnd);
  const isRemoteRef = useRef(isRemote);
  const isEffectivelyOfflineRef = useRef(isEffectivelyOffline);
  const connectedHostIdRef = useRef(connectedHostId);
  filterRef.current = filter;
  cursorEndRef.current = cursorEnd;
  isRemoteRef.current = isRemote;
  isEffectivelyOfflineRef.current = isEffectivelyOffline;
  connectedHostIdRef.current = connectedHostId;

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
      const currentHostId = connectedHostIdRef.current;
      const filterToUse = append && currentCursorEnd
        ? { ...currentFilter, afterCursor: currentCursorEnd }
        : currentFilter;

      let result;
      if (currentIsOffline) {
        // Query offline storage when in offline mode
        const hostId = currentHostId ?? 'local';
        result = await queryOfflineJournal(hostId, filterToUse);
      } else if (isRemoteRef.current) {
        // Query remote host when connected
        result = await queryRemoteJournal(filterToUse);
      } else {
        // Query local journal when not connected
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
      const currentHostId = connectedHostIdRef.current;
      if (!currentIsOffline && isConnectionError(err)) {
        try {
          await setOfflineMode(true);
          const hostId = currentHostId ?? 'local';
          const currentFilter = filterRef.current;
          const currentCursorEnd = cursorEndRef.current;
          const filterToUse = append && currentCursorEnd
            ? { ...currentFilter, afterCursor: currentCursorEnd }
            : currentFilter;
          const result = await queryOfflineJournal(hostId, filterToUse);

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
  // Track connection state to refresh when it changes
  const prevIsRemoteRef = useRef(isRemote);
  // Track offline mode to refresh when it changes
  const prevIsOfflineModeRef = useRef(isOfflineMode);

  // Refresh when connection state changes
  useEffect(() => {
    if (prevIsRemoteRef.current !== isRemote) {
      prevIsRemoteRef.current = isRemote;
      // Clear entries and fetch fresh data from the new source
      setEntries([]);
      setCursorEnd(null);
      fetchLogs(false);
    }
  }, [isRemote, setEntries, setCursorEnd, fetchLogs]);

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
