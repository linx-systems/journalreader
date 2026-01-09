import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTabSync } from '../useTabSync';
import { SCROLL_SYNC_OFFSET_MS } from '../../lib/constants';

describe('useTabSync', () => {
  describe('initial render', () => {
    it('does not trigger callbacks on initial render', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      renderHook(() =>
        useTabSync({
          activeTabId: 'tab-1',
          syncEnabled: false,
          anchorTimestamp: null,
          onClearEntries,
          onFetch,
        })
      );

      expect(onClearEntries).not.toHaveBeenCalled();
      expect(onFetch).not.toHaveBeenCalled();
    });
  });

  describe('tab switching', () => {
    it('clears entries and fetches when activeTabId changes', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: false,
            anchorTimestamp: null,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      expect(onClearEntries).not.toHaveBeenCalled();
      expect(onFetch).not.toHaveBeenCalled();

      // Switch tabs
      rerender({ activeTabId: 'tab-2' });

      expect(onClearEntries).toHaveBeenCalledTimes(1);
      expect(onFetch).toHaveBeenCalledTimes(1);
      expect(onFetch).toHaveBeenCalledWith(null);
    });

    it('does not trigger callbacks when activeTabId stays the same', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: false,
            anchorTimestamp: null,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      // Rerender with same tab ID
      rerender({ activeTabId: 'tab-1' });

      expect(onClearEntries).not.toHaveBeenCalled();
      expect(onFetch).not.toHaveBeenCalled();
    });
  });

  describe('scroll sync integration', () => {
    it('passes null syncAdjustedSince when syncEnabled is false', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: false,
            anchorTimestamp: 1000000000000, // 1ms in microseconds
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });

      expect(onFetch).toHaveBeenCalledWith(null);
    });

    it('passes null syncAdjustedSince when anchorTimestamp is null', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: true,
            anchorTimestamp: null,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });

      expect(onFetch).toHaveBeenCalledWith(null);
    });

    it('calculates sync-adjusted since when syncEnabled and anchorTimestamp are set', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      // Use a specific timestamp: Jan 1, 2024 12:00:00 UTC in microseconds
      const anchorTimestamp = new Date('2024-01-01T12:00:00Z').getTime() * 1000;

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: true,
            anchorTimestamp,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });

      expect(onFetch).toHaveBeenCalledTimes(1);
      const syncAdjustedSince = onFetch.mock.calls[0][0];

      expect(syncAdjustedSince).not.toBeNull();
      expect(typeof syncAdjustedSince).toBe('string');

      // Verify the calculated date is SCROLL_SYNC_OFFSET_MS before anchor
      const expectedDate = new Date(new Date('2024-01-01T12:00:00Z').getTime() - SCROLL_SYNC_OFFSET_MS);
      const actualDate = new Date(syncAdjustedSince!);

      expect(actualDate.getTime()).toBe(expectedDate.getTime());
    });

    it('produces valid ISO string for syncAdjustedSince', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const anchorTimestamp = Date.now() * 1000;

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: true,
            anchorTimestamp,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });

      const syncAdjustedSince = onFetch.mock.calls[0][0];

      // Should be a valid ISO date string
      const parsedDate = new Date(syncAdjustedSince!);
      expect(parsedDate.toString()).not.toBe('Invalid Date');
      expect(syncAdjustedSince).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('multiple tab switches', () => {
    it('handles multiple rapid tab switches correctly', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: false,
            anchorTimestamp: null,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });
      rerender({ activeTabId: 'tab-3' });
      rerender({ activeTabId: 'tab-4' });

      expect(onClearEntries).toHaveBeenCalledTimes(3);
      expect(onFetch).toHaveBeenCalledTimes(3);
    });

    it('handles switching back to original tab', () => {
      const onClearEntries = vi.fn();
      const onFetch = vi.fn();

      const { rerender } = renderHook(
        ({ activeTabId }) =>
          useTabSync({
            activeTabId,
            syncEnabled: false,
            anchorTimestamp: null,
            onClearEntries,
            onFetch,
          }),
        { initialProps: { activeTabId: 'tab-1' } }
      );

      rerender({ activeTabId: 'tab-2' });
      rerender({ activeTabId: 'tab-1' }); // Back to original

      expect(onClearEntries).toHaveBeenCalledTimes(2);
      expect(onFetch).toHaveBeenCalledTimes(2);
    });
  });
});
