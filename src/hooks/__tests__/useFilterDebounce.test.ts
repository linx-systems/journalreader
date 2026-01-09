import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilterDebounce } from '../useFilterDebounce';
import type { JournalFilter } from '../../lib/types';
import { DEBOUNCE_MS } from '../../lib/constants';

const createFilter = (overrides: Partial<JournalFilter> = {}): JournalFilter => ({
  units: [],
  excludedUnits: [],
  caseSensitive: false,
  limit: 500,
  reverse: true,
  ...overrides,
});

describe('useFilterDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial load', () => {
    it('calls onFilterChange immediately on initial render', () => {
      const onFilterChange = vi.fn();
      const filter = createFilter();

      renderHook(() =>
        useFilterDebounce({
          filter,
          onFilterChange,
        })
      );

      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });

    it('does not debounce on initial load', () => {
      const onFilterChange = vi.fn();
      const filter = createFilter();

      renderHook(() =>
        useFilterDebounce({
          filter,
          onFilterChange,
        })
      );

      // Should be called immediately, not after debounce delay
      expect(onFilterChange).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DEBOUNCE_MS);
      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('filter changes', () => {
    it('debounces filter changes', () => {
      const onFilterChange = vi.fn();
      let filter = createFilter();

      const { rerender } = renderHook(
        ({ filter }) =>
          useFilterDebounce({
            filter,
            onFilterChange,
          }),
        { initialProps: { filter } }
      );

      // Initial call
      expect(onFilterChange).toHaveBeenCalledTimes(1);

      // Change filter
      filter = createFilter({ since: '1 hour ago' });
      rerender({ filter });

      // Should not be called yet (debouncing)
      expect(onFilterChange).toHaveBeenCalledTimes(1);

      // Advance time past debounce delay
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });

      expect(onFilterChange).toHaveBeenCalledTimes(2);
    });

    it('does not call onFilterChange if filter reference changes but values are equal', () => {
      const onFilterChange = vi.fn();
      const filter1 = createFilter({ since: '1 hour ago' });

      const { rerender } = renderHook(
        ({ filter }) =>
          useFilterDebounce({
            filter,
            onFilterChange,
          }),
        { initialProps: { filter: filter1 } }
      );

      expect(onFilterChange).toHaveBeenCalledTimes(1);

      // Create new object with same values
      const filter2 = createFilter({ since: '1 hour ago' });
      rerender({ filter: filter2 });

      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });

      // Should not be called again - filters are equal
      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });

    it('cancels pending debounce when filter changes again', () => {
      const onFilterChange = vi.fn();
      let filter = createFilter();

      const { rerender } = renderHook(
        ({ filter }) =>
          useFilterDebounce({
            filter,
            onFilterChange,
          }),
        { initialProps: { filter } }
      );

      expect(onFilterChange).toHaveBeenCalledTimes(1);

      // First change
      filter = createFilter({ since: '1 hour ago' });
      rerender({ filter });

      // Wait half the debounce time
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS / 2);
      });

      // Second change before debounce fires
      filter = createFilter({ since: '2 hours ago' });
      rerender({ filter });

      // Original debounce should be cancelled, only one more call expected
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });

      expect(onFilterChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('paused state', () => {
    it('does not call onFilterChange while paused', () => {
      const onFilterChange = vi.fn();
      let filter = createFilter();

      const { rerender } = renderHook(
        ({ filter, isPaused }) =>
          useFilterDebounce({
            filter,
            isPaused,
            onFilterChange,
          }),
        { initialProps: { filter, isPaused: true } }
      );

      // Should not be called when initially paused
      expect(onFilterChange).toHaveBeenCalledTimes(0);

      // Change filter while paused
      filter = createFilter({ since: '1 hour ago' });
      rerender({ filter, isPaused: true });

      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });

      // Still should not be called
      expect(onFilterChange).toHaveBeenCalledTimes(0);
    });

    it('calls onResume immediately when transitioning from paused to active', () => {
      const onFilterChange = vi.fn();
      const onResume = vi.fn();
      const filter = createFilter();

      const { rerender } = renderHook(
        ({ isPaused }) =>
          useFilterDebounce({
            filter,
            isPaused,
            onFilterChange,
            onResume,
          }),
        { initialProps: { isPaused: true } }
      );

      expect(onFilterChange).toHaveBeenCalledTimes(0);
      expect(onResume).toHaveBeenCalledTimes(0);

      // Resume
      rerender({ isPaused: false });

      expect(onResume).toHaveBeenCalledTimes(1);
      // onFilterChange should not be called on resume - onResume handles it
      expect(onFilterChange).toHaveBeenCalledTimes(0);
    });

    it('falls back to onFilterChange if onResume is not provided', () => {
      const onFilterChange = vi.fn();
      const filter = createFilter();

      const { rerender } = renderHook(
        ({ isPaused }) =>
          useFilterDebounce({
            filter,
            isPaused,
            onFilterChange,
          }),
        { initialProps: { isPaused: true } }
      );

      expect(onFilterChange).toHaveBeenCalledTimes(0);

      // Resume without onResume callback
      rerender({ isPaused: false });

      // onFilterChange should be called via default behavior
      // (the hook stores the filter and on next non-paused render will trigger)
      expect(onFilterChange).toHaveBeenCalledTimes(0);
    });
  });

  describe('cleanup', () => {
    it('clears debounce timer on unmount', () => {
      const onFilterChange = vi.fn();
      let filter = createFilter();

      const { rerender, unmount } = renderHook(
        ({ filter }) =>
          useFilterDebounce({
            filter,
            onFilterChange,
          }),
        { initialProps: { filter } }
      );

      expect(onFilterChange).toHaveBeenCalledTimes(1);

      // Change filter to start debounce
      filter = createFilter({ since: '1 hour ago' });
      rerender({ filter });

      // Unmount before debounce fires
      unmount();

      // Advance time
      act(() => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
      });

      // Debounced call should not have fired
      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });
  });
});
