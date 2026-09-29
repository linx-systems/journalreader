import { useCallback, useEffect, useRef, useState } from 'react';
import { queryJournal, queryRemoteJournal } from '../lib/tauri';
import { queryOfflineJournal } from '../lib/offlineTauri';
import { isConnectionError } from '../lib/connectionErrors';
import { filtersEqual, type JournalEntry, type JournalFilter, type JournalQueryResult } from '../lib/types';

export interface JournalDataSource {
  hostId: string;
  isRemote: boolean;
  isConnected: boolean;
  isOffline: boolean;
}

export interface JournalStateActions {
  setEntries: (entries: JournalEntry[]) => void;
  appendEntries: (entries: JournalEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursorEnd: (cursor: string | null) => void;
  setOfflineMode: (offline: boolean) => void;
}

export interface JournalRefs {
  filter: JournalFilter;
  cursorEnd: string | null;
  dataSource: JournalDataSource;
  enabled: boolean;
}

interface UseJournalFetchOptions {
  actions: JournalStateActions;
  refs: React.MutableRefObject<JournalRefs>;
  /**
   * Reads state directly from the owning Zustand stores. This avoids accepting
   * a response merely because a component has not re-rendered yet.
   */
  getCurrent: () => JournalRefs;
}

export interface FailedJournalRequest {
  append: boolean;
  cursor: string | null;
  overrides: Partial<JournalFilter>;
  baseFilter: JournalFilter;
  dataSource: JournalDataSource;
  canRetry: boolean;
}

interface UseJournalFetchResult {
  fetchLogs: (append?: boolean, overrides?: Partial<JournalFilter>) => Promise<void>;
  retryFailedRequest: () => void;
  canRetryFailedRequest: boolean;
  invalidate: () => void;
}

function sameSource(a: JournalDataSource, b: JournalDataSource): boolean {
  return a.hostId === b.hostId
    && a.isRemote === b.isRemote
    && a.isConnected === b.isConnected
    && a.isOffline === b.isOffline;
}

export function useJournalFetch({
  actions,
  refs,
  getCurrent,
}: UseJournalFetchOptions): UseJournalFetchResult {
  const { setEntries, appendEntries, setLoading, setError, setHasMore, setCursorEnd, setOfflineMode } = actions;
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const appendInFlightRef = useRef(false);
  const [failedRequest, setFailedRequest] = useState<FailedJournalRequest | null>(null);

  const invalidate = useCallback(() => {
    generationRef.current += 1;
    appendInFlightRef.current = false;
    setFailedRequest(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidate();
    };
  }, [invalidate]);

  const executeRequest = useCallback(async (
    request: Pick<FailedJournalRequest, 'append' | 'cursor' | 'overrides'>,
  ) => {
    const { append, cursor, overrides } = request;
    if (append && appendInFlightRef.current) {
      return;
    }

    // A refresh replaces every prior request, including an append.
    generationRef.current += 1;
    const generation = generationRef.current;
    if (append) {
      appendInFlightRef.current = true;
    } else {
      appendInFlightRef.current = false;
    }

    const captured = refs.current;
    const baseFilter = captured.filter;
    const filter = {
      ...baseFilter,
      ...overrides,
      ...(append && cursor ? { afterCursor: cursor } : {}),
    };
    const requestIsCurrent = () => {
      const current = getCurrent();
      return mountedRef.current
        && generation === generationRef.current
        && current.enabled
        && filtersEqual(baseFilter, current.filter)
        && sameSource(captured.dataSource, current.dataSource)
        && (!append || current.cursorEnd === cursor);
    };
    const completionIsCurrent = () => {
      const current = getCurrent();
      return mountedRef.current
        && generation === generationRef.current
        && current.enabled
        && filtersEqual(baseFilter, current.filter)
        && sameSource(captured.dataSource, current.dataSource);
    };

    if (!requestIsCurrent()) {
      if (append) appendInFlightRef.current = false;
      return;
    }
    setFailedRequest(null);
    setLoading(true);
    setError(null);

    try {
      const result = await queryDataSource({ filter, ...captured.dataSource });
      if (!requestIsCurrent()) return;

      if (append) {
        appendEntries(result.entries);
      } else {
        setEntries(result.entries);
      }
      setHasMore(result.hasMore);
      setCursorEnd(result.cursorEnd ?? null);
    } catch (err) {
      if (!requestIsCurrent()) return;

      // Changing the persisted frontend state synchronously causes the owning
      // replacement effect to fetch cached page one. Never query a stale source
      // inline here.
      if (
        captured.dataSource.isRemote
        && !captured.dataSource.isOffline
        && isConnectionError(err)
      ) {
        setOfflineMode(true);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setFailedRequest({
        append,
        cursor,
        overrides: { ...overrides },
        baseFilter,
        dataSource: captured.dataSource,
        canRetry: !(append && captured.dataSource.isOffline && /cursor expired/i.test(message)),
      });
      setError(message);
    } finally {
      if (append && generation === generationRef.current) {
        appendInFlightRef.current = false;
      }
      if (completionIsCurrent()) {
        setLoading(false);
      }
    }
  }, [
    appendEntries,
    getCurrent,
    refs,
    setEntries,
    setError,
    setHasMore,
    setLoading,
    setCursorEnd,
    setOfflineMode,
  ]);

  const fetchLogs = useCallback(async (
    append = false,
    overrides: Partial<JournalFilter> = {},
  ) => {
    await executeRequest({
      append,
      cursor: append ? refs.current.cursorEnd : null,
      overrides,
    });
  }, [executeRequest, refs]);

  const canRetryFailedRequest = failedRequest !== null
    && failedRequest.canRetry
    && (!failedRequest.append || refs.current.cursorEnd === failedRequest.cursor);

  const retryFailedRequest = useCallback(() => {
    if (
      !canRetryFailedRequest
      || failedRequest === null
      || !filtersEqual(failedRequest.baseFilter, getCurrent().filter)
      || !sameSource(failedRequest.dataSource, getCurrent().dataSource)
      || (failedRequest.append && getCurrent().cursorEnd !== failedRequest.cursor)
    ) {
      return;
    }
    void executeRequest(failedRequest);
  }, [canRetryFailedRequest, executeRequest, failedRequest, getCurrent]);

  return {
    fetchLogs,
    retryFailedRequest,
    canRetryFailedRequest,
    invalidate,
  };

}

async function queryDataSource(options: {
  filter: JournalFilter;
  hostId: string;
  isRemote: boolean;
  isConnected: boolean;
  isOffline: boolean;
}): Promise<JournalQueryResult> {
  const { filter, hostId, isRemote, isConnected, isOffline } = options;
  if (isOffline) {
    return queryOfflineJournal(hostId, filter);
  }
  if (isRemote && isConnected) {
    return queryRemoteJournal(hostId, filter);
  }
  if (isRemote) {
    return queryOfflineJournal(hostId, filter);
  }
  return queryJournal(filter);
}
