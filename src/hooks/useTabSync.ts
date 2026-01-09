import { useEffect, useRef } from 'react';
import { SCROLL_SYNC_OFFSET_MS } from '../lib/constants';

interface UseTabSyncOptions {
  /** The currently active tab ID */
  activeTabId: string;
  /** Whether scroll sync is enabled */
  syncEnabled: boolean;
  /** The anchor timestamp in microseconds (or null if not set) */
  anchorTimestamp: number | null;
  /** Callback to clear existing entries before fetching new data */
  onClearEntries: () => void;
  /** Callback to fetch logs with an optional adjusted 'since' filter */
  onFetch: (syncAdjustedSince: string | null) => void;
}

/**
 * Hook that handles tab switching logic for journal logs.
 * When the active tab changes, it clears entries and triggers a fetch.
 * If scroll sync is enabled, it adjusts the 'since' filter to load entries
 * around the anchor timestamp.
 *
 * @example
 * ```tsx
 * useTabSync({
 *   activeTabId,
 *   syncEnabled,
 *   anchorTimestamp,
 *   onClearEntries: () => {
 *     setEntries([]);
 *     setCursorEnd(null);
 *   },
 *   onFetch: (syncAdjustedSince) => {
 *     syncAdjustedFilterRef.current = syncAdjustedSince ? { since: syncAdjustedSince } : null;
 *     fetchLogs(false);
 *   },
 * });
 * ```
 */
export function useTabSync({
  activeTabId,
  syncEnabled,
  anchorTimestamp,
  onClearEntries,
  onFetch,
}: UseTabSyncOptions): void {
  const prevActiveTabIdRef = useRef(activeTabId);

  useEffect(() => {
    if (prevActiveTabIdRef.current !== activeTabId) {
      prevActiveTabIdRef.current = activeTabId;
      // Clear entries before fetching from new tab
      onClearEntries();

      // Calculate sync-adjusted 'since' filter if scroll sync is active
      let syncAdjustedSince: string | null = null;
      if (syncEnabled && anchorTimestamp !== null) {
        // Convert microseconds to Date, go back to ensure context
        const anchorDate = new Date(anchorTimestamp / 1000);
        const sinceDate = new Date(anchorDate.getTime() - SCROLL_SYNC_OFFSET_MS);
        syncAdjustedSince = sinceDate.toISOString();
      }

      onFetch(syncAdjustedSince);
    }
  }, [activeTabId, syncEnabled, anchorTimestamp, onClearEntries, onFetch]);
}
