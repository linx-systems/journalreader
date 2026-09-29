import { useEffect, useRef } from 'react';
import { filtersEqual, type JournalFilter } from '../lib/types';
import { DEBOUNCE_MS } from '../lib/constants';

interface UseFilterDebounceOptions {
  filter: JournalFilter;
  isPaused?: boolean;
  /** Changes whenever the source or query enablement is replaced. */
  resetKey: string;
  onFilterChange: () => void;
}

/**
 * Debounces only filter edits made after a controller has loaded its first
 * page. Source replacement owns first-page loading.
 */
export function useFilterDebounce({
  filter,
  isPaused = false,
  resetKey,
  onFilterChange,
}: UseFilterDebounceOptions): void {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFilterRef = useRef<JournalFilter | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    prevFilterRef.current = filter;
  }, [resetKey]);

  useEffect(() => {
    const previous = prevFilterRef.current;
    if (previous === null || filtersEqual(previous, filter)) {
      prevFilterRef.current = filter;
      return;
    }
    prevFilterRef.current = filter;
    if (isPaused) return;

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      onFilterChange();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [filter, isPaused, onFilterChange, resetKey]);

  useEffect(() => () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);
}
