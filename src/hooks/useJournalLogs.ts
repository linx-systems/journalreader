import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore } from '../stores/connectionStore';
import { queryJournal, queryRemoteJournal } from '../lib/tauri';

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
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs to access current values without causing effect re-runs
  const filterRef = useRef(filter);
  const cursorEndRef = useRef(cursorEnd);
  const isRemoteRef = useRef(isRemote);
  filterRef.current = filter;
  cursorEndRef.current = cursorEnd;
  isRemoteRef.current = isRemote;

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
      const filterToUse = append && currentCursorEnd
        ? { ...currentFilter, afterCursor: currentCursorEnd }
        : currentFilter;

      // Use remote or local query based on connection state
      const result = isRemoteRef.current
        ? await queryRemoteJournal(filterToUse)
        : await queryJournal(filterToUse);

      if (append) {
        appendEntries(result.entries);
      } else {
        setEntries(result.entries);
      }

      setHasMore(result.hasMore);
      setCursorEnd(result.cursorEnd ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd]);

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
    const filterChanged = JSON.stringify(prevFilterRef.current) !== JSON.stringify(filter);
    if (!filterChanged && !isInitialLoad) {
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
