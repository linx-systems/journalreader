import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../stores/connectionStore';
import { useOfflineStore } from '../stores/offlineStore';
import { useScrollSyncStore } from '../stores/scrollSyncStore';
import { useFollowModeStore } from '../stores/followModeStore';
import { useLayoutStore } from '../stores/layoutStore';
import { SCROLL_SYNC_OFFSET_MS } from '../lib/constants';
import { filtersEqual } from '../lib/types';
import { useJournalFetch, type JournalDataSource, type JournalRefs } from './useJournalFetch';
import { useFilterDebounce } from './useFilterDebounce';

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

/**
 * The sole owner of main-view journal requests. Views read their own narrow
 * store slices and receive only these control callbacks.
 */
export function useJournalLogs(enabled = true) {
  const filter = useFilterStore((state) => state.filter);
  const cursorEnd = useFilterStore((state) => state.cursorEnd);
  const isLoading = useFilterStore((state) => state.isLoading);
  const hasMore = useFilterStore((state) => state.hasMore);
  const isFollowing = useFilterStore((state) => state.isFollowing);
  const setEntries = useFilterStore((state) => state.setEntries);
  const appendEntries = useFilterStore((state) => state.appendEntries);
  const setLoading = useFilterStore((state) => state.setLoading);
  const setError = useFilterStore((state) => state.setError);
  const setHasMore = useFilterStore((state) => state.setHasMore);
  const setCursorEnd = useFilterStore((state) => state.setCursorEnd);
  const { connectedHostId, connectionStatus, activeTabId } = useConnectionStore();
  const { isOfflineMode, setOfflineMode } = useOfflineStore();
  const { syncEnabled, anchorTimestamp } = useScrollSyncStore();
  const desiredSession = useFollowModeStore((state) => state.desiredSession);
  const layout = useLayoutStore((state) => state.layout);

  const dataSource = sourceFor(activeTabId, connectedHostId, connectionStatus, isOfflineMode);
  const sourceKey = [
    dataSource.hostId,
    dataSource.isConnected ? 'connected' : 'disconnected',
    dataSource.isOffline ? 'offline' : 'online',
  ].join(':');
  const queryEnabled = enabled && layout === 'single' && !isFollowing && desiredSession === null;
  const refsRef = useRef<JournalRefs>({ filter, cursorEnd, dataSource, enabled: queryEnabled });
  refsRef.current = { filter, cursorEnd, dataSource, enabled: queryEnabled };

  const getCurrent = useCallback((): JournalRefs => {
    const currentFilter = useFilterStore.getState();
    const currentConnection = useConnectionStore.getState();
    const currentOffline = useOfflineStore.getState();
    const currentFollow = useFollowModeStore.getState();
    const currentLayout = useLayoutStore.getState();
    return {
      filter: currentFilter.filter,
      cursorEnd: currentFilter.cursorEnd,
      dataSource: sourceFor(
        currentConnection.activeTabId,
        currentConnection.connectedHostId,
        currentConnection.connectionStatus,
        currentOffline.isOfflineMode,
      ),
      enabled: enabled
        && currentLayout.layout === 'single'
        && !currentFilter.isFollowing
        && currentFollow.desiredSession === null,
    };
  }, [enabled]);

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
  const previousBaseFilterRef = useRef(filter);
  const previousTabRef = useRef(activeTabId);
  const syncConfigRef = useRef({ syncEnabled, anchorTimestamp });
  syncConfigRef.current = { syncEnabled, anchorTimestamp };

  useEffect(() => {
    if (!filtersEqual(previousBaseFilterRef.current, filter)) {
      overridesRef.current = {};
      previousTabRef.current = activeTabId;
      invalidate();
    }
    previousBaseFilterRef.current = filter;
  }, [activeTabId, filter, invalidate]);

  useEffect(() => {
    invalidate();
    if (!queryEnabled) {
      setLoading(false);
      return;
    }

    if (previousTabRef.current !== activeTabId) {
      const { syncEnabled: shouldSync, anchorTimestamp: anchor } = syncConfigRef.current;
      overridesRef.current = shouldSync && anchor !== null
        ? { since: new Date(anchor / 1000 - SCROLL_SYNC_OFFSET_MS).toISOString() }
        : {};
      previousTabRef.current = activeTabId;
    }
    const startupError = useFollowModeStore.getState().startupError;
    setEntries([]);
    setCursorEnd(null);
    setHasMore(false);
    setError(null);
    void fetchLogs(false, overridesRef.current);
    if (startupError) {
      setError(startupError);
      useFollowModeStore.getState().setStartupError(null);
    }
    return invalidate;
  }, [
    activeTabId,
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

  return { refresh, loadMore, retry, canRetry: canRetryFailedRequest };
}
