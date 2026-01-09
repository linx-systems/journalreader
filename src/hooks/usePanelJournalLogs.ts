import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSplitPanelStore } from '../stores/splitPanelStore';
import { queryJournal, queryRemoteJournal } from '../lib/tauri';
import { queryOfflineJournal } from '../lib/offlineTauri';
import { filtersEqual } from '../lib/types';

/**
 * Check if an error is a connection-related error that should trigger offline fallback.
 */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('unreachable') ||
    message.includes('offline') ||
    message.includes('ssh') ||
    message.includes('failed to connect')
  );
}

export type PanelPosition = 'left' | 'right';

interface UsePanelJournalLogsOptions {
  /** The host ID to fetch logs for */
  hostId: string;
  /** Which panel this is (left or right) */
  panelPosition: PanelPosition;
}

/**
 * Hook for fetching journal logs for a specific panel in split view.
 * Unlike useJournalLogs which uses activeTabId from the connection store,
 * this hook accepts an explicit hostId prop for the panel to display.
 */
export function usePanelJournalLogs({ hostId, panelPosition }: UsePanelJournalLogsOptions) {
  const { filter } = useFilterStore();
  const { connectedHostId, connectionStatus } = useConnectionStore();
  const { isOfflineMode, setOfflineMode } = useOfflineStore();

  // Select the correct panel state based on position
  const panelState = useSplitPanelStore((state) =>
    panelPosition === 'left' ? state.leftPanel : state.rightPanel
  );

  // Get refresh trigger to respond to toolbar refresh
  const refreshTrigger = useSplitPanelStore((state) => state.refreshTrigger);

  // Get panel-specific actions
  const {
    setLeftEntries, appendLeftEntries, setLeftLoading, setLeftError, setLeftHasMore, setLeftCursorEnd,
    setRightEntries, appendRightEntries, setRightLoading, setRightError, setRightHasMore, setRightCursorEnd,
  } = useSplitPanelStore();

  // Select actions based on panel position
  const setEntries = panelPosition === 'left' ? setLeftEntries : setRightEntries;
  const appendEntries = panelPosition === 'left' ? appendLeftEntries : appendRightEntries;
  const setLoading = panelPosition === 'left' ? setLeftLoading : setRightLoading;
  const setError = panelPosition === 'left' ? setLeftError : setRightError;
  const setHasMore = panelPosition === 'left' ? setLeftHasMore : setRightHasMore;
  const setCursorEnd = panelPosition === 'left' ? setLeftCursorEnd : setRightCursorEnd;

  const { entries, isLoading, error, hasMore, cursorEnd } = panelState;

  // Determine if the host is remote
  const isRemote = hostId !== LOCAL_TAB_ID;
  // Determine if we're connected to this specific host
  const isConnectedToHost = isRemote && connectedHostId === hostId && connectionStatus === 'connected';
  // Determine if we're effectively offline for this host
  const isEffectivelyOffline = isRemote && (isOfflineMode || !isConnectedToHost);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs to access current values without causing effect re-runs
  const filterRef = useRef(filter);
  const cursorEndRef = useRef(cursorEnd);
  const hostIdRef = useRef(hostId);
  const isRemoteRef = useRef(isRemote);
  const isConnectedToHostRef = useRef(isConnectedToHost);
  const isEffectivelyOfflineRef = useRef(isEffectivelyOffline);

  filterRef.current = filter;
  cursorEndRef.current = cursorEnd;
  hostIdRef.current = hostId;
  isRemoteRef.current = isRemote;
  isConnectedToHostRef.current = isConnectedToHost;
  isEffectivelyOfflineRef.current = isEffectivelyOffline;

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
      const currentHostId = hostIdRef.current;
      const currentIsRemote = isRemoteRef.current;
      const currentIsOffline = isEffectivelyOfflineRef.current;
      const currentIsConnectedToHost = isConnectedToHostRef.current;

      const filterToUse = append && currentCursorEnd
        ? { ...currentFilter, afterCursor: currentCursorEnd }
        : currentFilter;

      let result;
      if (currentIsOffline) {
        // Explicit offline mode - query offline storage
        result = await queryOfflineJournal(currentHostId, filterToUse);
      } else if (currentIsRemote && currentIsConnectedToHost) {
        // Query remote host when connected to this specific host
        result = await queryRemoteJournal(filterToUse);
      } else if (currentIsRemote) {
        // Remote host but not connected to it - query offline storage
        result = await queryOfflineJournal(currentHostId, filterToUse);
      } else {
        // Query local journal
        result = await queryJournal(filterToUse);
      }

      if (append) {
        appendEntries(result.entries);
      } else {
        setEntries(result.entries);
      }

      setHasMore(result.hasMore);
      setCursorEnd(result.cursorEnd ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Auto-fallback: if remote query fails with connection error, switch to offline mode
      const currentIsOffline = isEffectivelyOfflineRef.current;
      const currentHostId = hostIdRef.current;
      if (!currentIsOffline && isConnectionError(err)) {
        try {
          await setOfflineMode(true);
          const currentFilter = filterRef.current;
          const currentCursorEnd = cursorEndRef.current;
          const filterToUse = append && currentCursorEnd
            ? { ...currentFilter, afterCursor: currentCursorEnd }
            : currentFilter;
          const result = await queryOfflineJournal(currentHostId, filterToUse);

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
  }, [setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchLogs(true);
    }
  }, [isLoading, hasMore, fetchLogs]);

  const refresh = useCallback(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Cleanup AbortController on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Track previous hostId to detect changes
  const prevHostIdRef = useRef(hostId);
  // Track the filter for comparison
  const prevFilterRef = useRef<typeof filter | null>(null);

  // Fetch when hostId changes
  useEffect(() => {
    if (prevHostIdRef.current !== hostId) {
      prevHostIdRef.current = hostId;
      // Clear entries and fetch fresh data
      setEntries([]);
      setCursorEnd(null);
      fetchLogs(false);
    }
  }, [hostId, setEntries, setCursorEnd, fetchLogs]);

  // Debounced fetch when filter changes
  useEffect(() => {
    // Check if this is the initial load
    const isInitialLoad = prevFilterRef.current === null;

    // Only fetch if filter actually changed
    if (filtersEqual(prevFilterRef.current, filter) && !isInitialLoad) {
      return;
    }
    prevFilterRef.current = filter;

    // On initial load, fetch immediately
    if (isInitialLoad) {
      fetchLogs(false);
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
  }, [filter, fetchLogs]);

  // Track refresh trigger to respond to toolbar refresh button
  const prevRefreshTriggerRef = useRef(refreshTrigger);

  // Respond to external refresh trigger (from toolbar)
  useEffect(() => {
    // Skip initial render
    if (prevRefreshTriggerRef.current === refreshTrigger) {
      return;
    }
    prevRefreshTriggerRef.current = refreshTrigger;
    fetchLogs(false);
  }, [refreshTrigger, fetchLogs]);

  return {
    entries,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
