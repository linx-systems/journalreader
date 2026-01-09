import { useEffect, useRef } from 'react';
import { filtersEqual, type JournalFilter } from '../lib/types';
import { DEBOUNCE_MS } from '../lib/constants';

interface UseFilterDebounceOptions {
  /** The current filter state */
  filter: JournalFilter;
  /** Whether the filter effect is paused (e.g., during follow mode) */
  isPaused?: boolean;
  /** Callback to invoke when filter changes (debounced) */
  onFilterChange: () => void;
  /** Callback to invoke immediately when exiting paused state */
  onResume?: () => void;
}

/**
 * Hook that triggers a callback when filters change, with debouncing.
 * Handles initial load, paused state (e.g., follow mode), and debounced updates.
 *
 * @example
 * ```tsx
 * useFilterDebounce({
 *   filter,
 *   isPaused: isFollowing,
 *   onFilterChange: () => fetchLogs(false),
 *   onResume: () => fetchLogs(false),
 * });
 * ```
 */
export function useFilterDebounce({
  filter,
  isPaused = false,
  onFilterChange,
  onResume,
}: UseFilterDebounceOptions): void {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if we were previously paused
  const wasPausedRef = useRef(isPaused);
  // Track the filter for comparison (null indicates initial load)
  const prevFilterRef = useRef<JournalFilter | null>(null);

  useEffect(() => {
    // Handle transition from paused to active state
    if (wasPausedRef.current && !isPaused) {
      wasPausedRef.current = false;
      prevFilterRef.current = filter;
      onResume?.();
      return;
    }
    wasPausedRef.current = isPaused;

    // Don't trigger when paused
    if (isPaused) {
      return;
    }

    // Check if this is the initial load
    const isInitialLoad = prevFilterRef.current === null;

    // Only trigger if filter actually changed (efficient shallow comparison)
    if (filtersEqual(prevFilterRef.current, filter) && !isInitialLoad) {
      return;
    }
    prevFilterRef.current = filter;

    // On initial load, trigger immediately without debounce
    if (isInitialLoad) {
      onFilterChange();
      return;
    }

    // Debounce subsequent filter changes
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onFilterChange();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [filter, isPaused, onFilterChange, onResume]);
}
