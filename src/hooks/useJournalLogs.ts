import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { queryJournal } from '../lib/tauri';

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs to access current values without causing effect re-runs
  const filterRef = useRef(filter);
  const cursorEndRef = useRef(cursorEnd);
  filterRef.current = filter;
  cursorEndRef.current = cursorEnd;

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

      const result = await queryJournal(filterToUse);

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
  const prevFilterRef = useRef(filter);

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

    // Only fetch if filter actually changed (not just reference)
    const filterChanged = JSON.stringify(prevFilterRef.current) !== JSON.stringify(filter);
    if (!filterChanged) {
      return;
    }
    prevFilterRef.current = filter;

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
