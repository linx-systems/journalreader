import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useSplitPanelStore } from '../stores/splitPanelStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useFollowModeStore } from '../stores/followModeStore';
import { useJournalFetch, type JournalDataSource, type JournalRefs } from './useJournalFetch';
import { useFilterDebounce } from './useFilterDebounce';

export type PanelPosition = 'left' | 'right';

interface UsePanelJournalLogsOptions {
  hostId: string;
  panelPosition: PanelPosition;
}

function sourceFor(
  hostId: string,
  connectedHostId: string | null,
  connectionStatus: string,
  isOfflineMode: boolean,
): JournalDataSource {
  const isRemote = hostId !== LOCAL_TAB_ID;
  const isConnected = isRemote
    && connectedHostId === hostId
    && connectionStatus === 'connected';
  return {
    hostId,
    isRemote,
    isConnected,
    isOffline: isRemote && (isOfflineMode || !isConnected),
  };
}

export function usePanelJournalLogs({ hostId, panelPosition }: UsePanelJournalLogsOptions) {
  const filter = useFilterStore((state) => state.filter);
  const isFollowing = useFilterStore((state) => state.isFollowing);
  const { connectedHostId, connectionStatus } = useConnectionStore();
  const { isOfflineMode, setOfflineMode } = useOfflineStore();
  const panelState = useSplitPanelStore((state) =>
    panelPosition === 'left' ? state.leftPanel : state.rightPanel
  );
  const refreshTrigger = useSplitPanelStore((state) => state.refreshTrigger);
  const layout = useLayoutStore((state) => state.layout);
  const desiredSession = useFollowModeStore((state) => state.desiredSession);
  const setLeftEntries = useSplitPanelStore((state) => state.setLeftEntries);
  const appendLeftEntries = useSplitPanelStore((state) => state.appendLeftEntries);
  const setLeftLoading = useSplitPanelStore((state) => state.setLeftLoading);
  const setLeftError = useSplitPanelStore((state) => state.setLeftError);
  const setLeftHasMore = useSplitPanelStore((state) => state.setLeftHasMore);
  const setLeftCursorEnd = useSplitPanelStore((state) => state.setLeftCursorEnd);
  const setRightEntries = useSplitPanelStore((state) => state.setRightEntries);
  const appendRightEntries = useSplitPanelStore((state) => state.appendRightEntries);
  const setRightLoading = useSplitPanelStore((state) => state.setRightLoading);
  const setRightError = useSplitPanelStore((state) => state.setRightError);
  const setRightHasMore = useSplitPanelStore((state) => state.setRightHasMore);
  const setRightCursorEnd = useSplitPanelStore((state) => state.setRightCursorEnd);
  const setEntries = panelPosition === 'left' ? setLeftEntries : setRightEntries;
  const appendEntries = panelPosition === 'left' ? appendLeftEntries : appendRightEntries;
  const setLoading = panelPosition === 'left' ? setLeftLoading : setRightLoading;
  const setError = panelPosition === 'left' ? setLeftError : setRightError;
  const setHasMore = panelPosition === 'left' ? setLeftHasMore : setRightHasMore;
  const setCursorEnd = panelPosition === 'left' ? setLeftCursorEnd : setRightCursorEnd;
  const { isLoading, hasMore, cursorEnd } = panelState;
  const dataSource = sourceFor(hostId, connectedHostId, connectionStatus, isOfflineMode);
  const sourceKey = [
    dataSource.hostId,
    dataSource.isConnected ? 'connected' : 'disconnected',
    dataSource.isOffline ? 'offline' : 'online',
  ].join(':');
  const queryEnabled = layout !== 'single' && !isFollowing && desiredSession === null;
  const refsRef = useRef<JournalRefs>({ filter, cursorEnd, dataSource, enabled: queryEnabled });
  refsRef.current = { filter, cursorEnd, dataSource, enabled: queryEnabled };

  const getCurrent = useCallback((): JournalRefs => {
    const currentFilter = useFilterStore.getState();
    const currentConnection = useConnectionStore.getState();
    const currentOffline = useOfflineStore.getState();
    const currentLayout = useLayoutStore.getState();
    const currentFollow = useFollowModeStore.getState();
    const currentPanel = panelPosition === 'left'
      ? useSplitPanelStore.getState().leftPanel
      : useSplitPanelStore.getState().rightPanel;
    const assignedHostId = panelPosition === 'left'
      ? currentLayout.leftPanelHostId ?? currentConnection.activeTabId
      : currentLayout.rightPanelHostId ?? LOCAL_TAB_ID;
    return {
      filter: currentFilter.filter,
      cursorEnd: currentPanel.cursorEnd,
      dataSource: sourceFor(
        assignedHostId,
        currentConnection.connectedHostId,
        currentConnection.connectionStatus,
        currentOffline.isOfflineMode,
      ),
      enabled: currentLayout.layout !== 'single'
        && !currentFilter.isFollowing
        && currentFollow.desiredSession === null,
    };
  }, [panelPosition]);

  const {
    fetchLogs,
    retryFailedRequest,
    canRetryFailedRequest,
    invalidate,
  } = useJournalFetch({
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
    getCurrent,
  });

  const overridesRef = useRef<Partial<typeof filter>>({});
  useEffect(() => {
    invalidate();
    if (!queryEnabled) {
      setLoading(false);
      return;
    }
    setEntries([]);
    setCursorEnd(null);
    setHasMore(false);
    setError(null);
    void fetchLogs(false, overridesRef.current);
    return invalidate;
  }, [
    fetchLogs,
    invalidate,
    queryEnabled,
    setEntries,
    setError,
    setHasMore,
    setLoading,
    setCursorEnd,
    sourceKey,
  ]);

  const refresh = useCallback(() => {
    overridesRef.current = {};
    void fetchLogs(false);
  }, [fetchLogs]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      void fetchLogs(true, overridesRef.current);
    }
  }, [fetchLogs, hasMore, isLoading]);

  const retry = useCallback(() => {
    retryFailedRequest();
  }, [retryFailedRequest]);

  const handleFilterChange = useCallback(() => {
    overridesRef.current = {};
    void fetchLogs(false);
  }, [fetchLogs]);

  useFilterDebounce({
    filter,
    isPaused: !queryEnabled,
    resetKey: `${sourceKey}:${queryEnabled}`,
    onFilterChange: handleFilterChange,
  });

  const previousRefreshTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (previousRefreshTriggerRef.current === refreshTrigger) return;
    previousRefreshTriggerRef.current = refreshTrigger;
    refresh();
  }, [refresh, refreshTrigger]);

  return {
    entries: panelState.entries,
    isLoading,
    error: panelState.error,
    hasMore,
    loadMore,
    refresh,
    retry,
    canRetry: canRetryFailedRequest,
  };
}
