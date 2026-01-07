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

  const fetchLogs = useCallback(async (append = false) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const filterToUse = append && cursorEnd
        ? { ...filter, afterCursor: cursorEnd }
        : filter;

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
  }, [filter, cursorEnd, setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd]);

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

  // Debounced fetch when filter changes (skip if in follow mode)
  useEffect(() => {
    // If we just exited follow mode, fetch immediately
    if (wasFollowingRef.current && !isFollowing) {
      wasFollowingRef.current = false;
      fetchLogs(false);
      return;
    }
    wasFollowingRef.current = isFollowing;

    // Don't fetch when in follow mode - the follow mode handles its own data
    if (isFollowing) {
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
