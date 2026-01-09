import { useCallback, useEffect, useRef } from 'react';
import { queryJournal, queryRemoteJournal } from '../lib/tauri';
import { queryOfflineJournal } from '../lib/offlineTauri';
import { isConnectionError } from '../lib/connectionErrors';
import type { JournalEntry, JournalFilter, JournalQueryResult } from '../lib/types';

/**
 * Configuration for determining which data source to query.
 */
export interface JournalDataSource {
  /** The host/tab ID being queried */
  hostId: string;
  /** Whether this is a remote host (vs local) */
  isRemote: boolean;
  /** Whether we're connected to this remote host */
  isConnected: boolean;
  /** Whether offline mode is active */
  isOffline: boolean;
}

/**
 * State setters for journal log state management.
 */
export interface JournalStateActions {
  setEntries: (entries: JournalEntry[]) => void;
  appendEntries: (entries: JournalEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursorEnd: (cursor: string | null) => void;
  setOfflineMode: (offline: boolean) => Promise<void>;
}

/**
 * Refs for accessing current values without triggering effect re-runs.
 */
export interface JournalRefs {
  filter: JournalFilter;
  cursorEnd: string | null;
  dataSource: JournalDataSource;
  /** Optional sync-adjusted filter override (used for tab switching with scroll sync) */
  syncAdjustedFilter?: { since?: string } | null;
}

interface UseJournalFetchOptions {
  /** State actions for updating journal state */
  actions: JournalStateActions;
  /** Refs for current values */
  refs: React.MutableRefObject<JournalRefs>;
  /** Optional callback to clear sync-adjusted filter after use */
  onSyncFilterUsed?: () => void;
}

interface UseJournalFetchResult {
  /** Fetch journal logs (optionally appending to existing entries) */
  fetchLogs: (append?: boolean) => Promise<void>;
  /** Load more entries (pagination) */
  loadMore: () => void;
  /** Refresh entries from the beginning */
  refresh: () => void;
}

/**
 * Core hook for fetching journal logs from local, remote, or offline sources.
 * Handles data source selection, pagination, offline fallback, and abort control.
 *
 * @example
 * ```tsx
 * const refs = useRef<JournalRefs>({
 *   filter,
 *   cursorEnd,
 *   dataSource: { hostId, isRemote, isConnected, isOffline },
 * });
 *
 * const { fetchLogs, loadMore, refresh } = useJournalFetch({
 *   actions: { setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode },
 *   refs,
 * });
 * ```
 */
export function useJournalFetch({
  actions,
  refs,
  onSyncFilterUsed,
}: UseJournalFetchOptions): UseJournalFetchResult {
  const { setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode } = actions;
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchLogs = useCallback(async (append = false) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const { filter, cursorEnd, dataSource, syncAdjustedFilter } = refs.current;
      const { hostId, isRemote, isConnected, isOffline } = dataSource;

      // Apply sync-adjusted filter if available (for tab switches with scroll sync)
      let baseFilter = filter;
      if (syncAdjustedFilter && !append) {
        baseFilter = { ...filter, ...syncAdjustedFilter };
        // Clear after use
        onSyncFilterUsed?.();
      }

      const filterToUse = append && cursorEnd
        ? { ...baseFilter, afterCursor: cursorEnd }
        : baseFilter;

      const result = await queryDataSource({
        filter: filterToUse,
        hostId,
        isRemote,
        isConnected,
        isOffline,
      });

      if (append) {
        appendEntries(result.entries);
      } else {
        setEntries(result.entries);
      }

      setHasMore(result.hasMore);
      setCursorEnd(result.cursorEnd ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const { dataSource, filter, cursorEnd } = refs.current;
      const { hostId, isOffline } = dataSource;

      // Auto-fallback: if remote query fails with connection error, switch to offline mode
      if (!isOffline && isConnectionError(err)) {
        try {
          await setOfflineMode(true);
          const filterToUse = append && cursorEnd
            ? { ...filter, afterCursor: cursorEnd }
            : filter;
          const result = await queryOfflineJournal(hostId, filterToUse);

          if (append) {
            appendEntries(result.entries);
          } else {
            setEntries(result.entries);
          }

          setHasMore(result.hasMore);
          setCursorEnd(result.cursorEnd ?? null);
          return; // Success after fallback
        } catch {
          // Fallback also failed, report original error
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode, refs, onSyncFilterUsed]);

  const loadMore = useCallback(() => {
    fetchLogs(true);
  }, [fetchLogs]);

  const refresh = useCallback(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  return { fetchLogs, loadMore, refresh };
}

/**
 * Query the appropriate data source based on connection state.
 */
async function queryDataSource(options: {
  filter: JournalFilter;
  hostId: string;
  isRemote: boolean;
  isConnected: boolean;
  isOffline: boolean;
}): Promise<JournalQueryResult> {
  const { filter, hostId, isRemote, isConnected, isOffline } = options;

  if (isOffline) {
    // Query offline storage when in offline mode or not connected
    return queryOfflineJournal(hostId, filter);
  } else if (isRemote && isConnected) {
    // Query remote host when connected
    return queryRemoteJournal(filter);
  } else if (isRemote) {
    // Remote but not connected - use offline storage
    return queryOfflineJournal(hostId, filter);
  } else {
    // Query local journal
    return queryJournal(filter);
  }
}
