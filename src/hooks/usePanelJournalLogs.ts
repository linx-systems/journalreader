import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSplitPanelStore } from '../stores/splitPanelStore';
import { useJournalFetch, type JournalRefs } from './useJournalFetch';
import { useFilterDebounce } from './useFilterDebounce';

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
 *
 * This hook composes smaller, focused hooks:
 * - useJournalFetch: Core fetching logic with offline fallback
 * - useFilterDebounce: Debounced filter change handling
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

  // Compute data source state
  const isRemote = hostId !== LOCAL_TAB_ID;
  const isConnectedToHost = isRemote && connectedHostId === hostId && connectionStatus === 'connected';
  const isEffectivelyOffline = isRemote && (isOfflineMode || !isConnectedToHost);

  // Refs for accessing current values without triggering effect re-runs
  const refsRef = useRef<JournalRefs>({
    filter,
    cursorEnd,
    dataSource: {
      hostId,
      isRemote,
      isConnected: isConnectedToHost,
      isOffline: isEffectivelyOffline,
    },
  });

  // Keep refs up to date
  refsRef.current = {
    filter,
    cursorEnd,
    dataSource: {
      hostId,
      isRemote,
      isConnected: isConnectedToHost,
      isOffline: isEffectivelyOffline,
    },
  };

  // Core fetch logic
  const { fetchLogs, loadMore: fetchLoadMore, refresh } = useJournalFetch({
    actions: {
      setEntries,
      appendEntries,
      setLoading,
      setError,
      setHasMore,
      setCursorEnd,
      setOfflineMode,
    },
    refs: refsRef,
  });

  // Guarded loadMore that checks state
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchLoadMore();
    }
  }, [isLoading, hasMore, fetchLoadMore]);

  // Fetch when hostId changes
  const prevHostIdRef = useRef(hostId);
  useEffect(() => {
    if (prevHostIdRef.current !== hostId) {
      prevHostIdRef.current = hostId;
      setEntries([]);
      setCursorEnd(null);
      fetchLogs(false);
    }
  }, [hostId, setEntries, setCursorEnd, fetchLogs]);

  // Handle filter changes with debouncing
  useFilterDebounce({
    filter,
    onFilterChange: useCallback(() => fetchLogs(false), [fetchLogs]),
  });

  // Track refresh trigger to respond to toolbar refresh button
  const prevRefreshTriggerRef = useRef(refreshTrigger);
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
