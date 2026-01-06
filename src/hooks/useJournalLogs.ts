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

  // Debounced fetch when filter changes
  useEffect(() => {
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
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    entries,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
