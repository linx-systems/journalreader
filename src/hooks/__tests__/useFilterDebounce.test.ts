import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFilterDebounce } from '../useFilterDebounce';
import type { JournalFilter } from '../../lib/types';
import { DEBOUNCE_MS } from '../../lib/constants';

function filter(overrides: Partial<JournalFilter> = {}): JournalFilter {
  return {
    units: [],
    excludedUnits: [],
    caseSensitive: false,
    limit: 500,
    reverse: true,
    ...overrides,
  };
}

describe('useFilterDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fetch the initial baseline', () => {
    const onFilterChange = vi.fn();
    renderHook(() => useFilterDebounce({
      filter: filter(),
      resetKey: 'local:enabled',
      onFilterChange,
    }));
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('debounces only a subsequent changed filter', () => {
    const onFilterChange = vi.fn();
    const { rerender } = renderHook(
      ({ currentFilter }) => useFilterDebounce({
        filter: currentFilter,
        resetKey: 'local:enabled',
        onFilterChange,
      }),
      { initialProps: { currentFilter: filter() } },
    );

    rerender({ currentFilter: filter({ grepPattern: 'updated' }) });
    expect(onFilterChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(onFilterChange).toHaveBeenCalledTimes(1);
  });

  it('cancels pending work and resets its baseline when source changes', () => {
    const onFilterChange = vi.fn();
    const { rerender } = renderHook(
      ({ currentFilter, resetKey }) => useFilterDebounce({
        filter: currentFilter,
        resetKey,
        onFilterChange,
      }),
      { initialProps: { currentFilter: filter(), resetKey: 'A:enabled' } },
    );

    rerender({
      currentFilter: filter({ grepPattern: 'will-cancel' }),
      resetKey: 'A:enabled',
    });
    rerender({
      currentFilter: filter({ grepPattern: 'will-cancel' }),
      resetKey: 'B:enabled',
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('does not schedule changes while paused', () => {
    const onFilterChange = vi.fn();
    const { rerender } = renderHook(
      ({ currentFilter }) => useFilterDebounce({
        filter: currentFilter,
        isPaused: true,
        resetKey: 'local:paused',
        onFilterChange,
      }),
      { initialProps: { currentFilter: filter() } },
    );
    rerender({ currentFilter: filter({ since: '1 hour ago' }) });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(onFilterChange).not.toHaveBeenCalled();
  });
});
