import { useCallback, useEffect, useRef } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { LOCAL_TAB_ID, useConnectionStore } from '../stores/connectionStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useOfflineStore } from '../stores/offlineStore';
import {
  cleanupListeners,
  setupListeners,
  useFollowModeStore,
  type DesiredFollowSession,
} from '../stores/followModeStore';
import { DEBOUNCE_MS } from '../lib/constants';
import {
  getHostPassword,
  startFollow,
  startRemoteFollow,
  stopFollow,
  stopRemoteFollow,
} from '../lib/tauri';
import { filtersEqual, type JournalFilter } from '../lib/types';
import { logError } from '../lib/errorLogger';

interface FollowSource {
  hostId: string;
  remote: boolean;
}

function currentFollowSource(): FollowSource | null {
  const connection = useConnectionStore.getState();
  if (connection.activeTabId === LOCAL_TAB_ID) {
    return { hostId: LOCAL_TAB_ID, remote: false };
  }
  return !useOfflineStore.getState().isOfflineMode
    && connection.connectionStatus === 'connected'
    && connection.connectedHostId === connection.activeTabId
    ? { hostId: connection.activeTabId, remote: true }
    : null;
}

function sessionSourceIsCurrent(session: FollowRun): boolean {
  const source = currentFollowSource();
  return !useOfflineStore.getState().isOfflineMode
    && useLayoutStore.getState().layout === 'single'
    && source !== null
    && source.hostId === session.hostId
    && source.remote === session.remote;
}

interface FollowRun extends DesiredFollowSession {
  remote: boolean;
  accepting: boolean;
  stopping: boolean;
}

function newSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Owns the one live-follow session for the application shell. */
export function useFollowMode() {
  const filter = useFilterStore((state) => state.filter);
  const isFollowing = useFilterStore((state) => state.isFollowing);
  const isFollowPaused = useFilterStore((state) => state.isFollowPaused);
  const activeTabId = useConnectionStore((state) => state.activeTabId);
  const connectedHostId = useConnectionStore((state) => state.connectedHostId);
  const connectionStatus = useConnectionStore((state) => state.connectionStatus);
  const isOfflineMode = useOfflineStore((state) => state.isOfflineMode);
  const layout = useLayoutStore((state) => state.layout);

  const source: FollowSource | null = activeTabId === LOCAL_TAB_ID
    ? { hostId: LOCAL_TAB_ID, remote: false }
    : !isOfflineMode && connectionStatus === 'connected' && connectedHostId === activeTabId
      ? { hostId: activeTabId, remote: true }
      : null;
  const sourceKey = source ? `${source.remote ? 'remote' : 'local'}:${source.hostId}` : 'unavailable';
  const followAvailable = source !== null && !isOfflineMode && layout === 'single';

  const filterRef = useRef(filter);
  const runRef = useRef<FollowRun | null>(null);
  const queueRef = useRef(Promise.resolve());
  const restartTimerRef = useRef<number | undefined>(undefined);
  const restartIntentRef = useRef(0);
  const mountedRef = useRef(true);
  const previousFilterRef = useRef<JournalFilter | null>(null);
  filterRef.current = filter;

  const release = useCallback((session: DesiredFollowSession) => {
    const desired = useFollowModeStore.getState().desiredSession;
    if (desired?.hostId === session.hostId && desired.sessionId === session.sessionId) {
      useFollowModeStore.getState().setDesiredSession(null);
    }
    const run = runRef.current;
    if (run?.hostId === session.hostId && run.sessionId === session.sessionId) {
      runRef.current = null;
    }
  }, []);

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const next = queueRef.current.then(operation, operation);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const invalidateRestartIntent = useCallback(() => {
    restartIntentRef.current += 1;
    if (restartTimerRef.current !== undefined) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = undefined;
    }
    return restartIntentRef.current;
  }, []);

  const ownsSession = useCallback((session: FollowRun, intent: number) => (
    mountedRef.current
    && restartIntentRef.current === intent
    && runRef.current === session
    && !session.stopping
    && session.accepting
    && sessionSourceIsCurrent(session)
  ), []);

  const stopRun = useCallback(async (run: FollowRun) => {
    try {
      if (run.remote) {
        await stopRemoteFollow(run.hostId, run.sessionId);
      } else {
        await stopFollow(run.sessionId);
      }
    } catch (error) {
      logError(error, { component: 'useFollowMode', action: 'stop' });
    } finally {
      release(run);
      const current = useFilterStore.getState();
      current.setFollowing(false);
      current.setFollowPaused(false);
    }
  }, [release]);

  const requestStop = useCallback((run = runRef.current, invalidateIntent = true) => {
    if (invalidateIntent) invalidateRestartIntent();
    if (!run || run.stopping) return queueRef.current;
    run.stopping = true;
    useFilterStore.getState().setFollowPaused(false);
    return enqueue(() => stopRun(run));
  }, [enqueue, invalidateRestartIntent, stopRun]);

  const begin = useCallback((
    requestedFilter: JournalFilter = filterRef.current,
    intent = restartIntentRef.current,
  ) => {
    const currentSource = currentFollowSource();
    if (
      !mountedRef.current
      || restartIntentRef.current !== intent
      || !currentSource
      || useOfflineStore.getState().isOfflineMode
      || useLayoutStore.getState().layout !== 'single'
      || runRef.current !== null
    ) {
      return Promise.resolve();
    }

    const session: FollowRun = {
      hostId: currentSource.hostId,
      sessionId: newSessionId(),
      remote: currentSource.remote,
      accepting: true,
      stopping: false,
    };
    // This must happen before the first await: historical request guards read it synchronously.
    runRef.current = session;
    useFollowModeStore.getState().setStartupError(null);
    useFollowModeStore.getState().setDesiredSession(session);
    const filterState = useFilterStore.getState();
    filterState.setEntries([]);
    filterState.setCursorEnd(null);
    filterState.setHasMore(false);
    filterState.setError(null);

    return enqueue(async () => {
      try {
        if (!ownsSession(session, intent)) return;
        await setupListeners(
          useFilterStore.getState().prependEntries,
          useFilterStore.getState().setError,
          useFilterStore.getState().setFollowing,
          (candidate) => (
            candidate.hostId === session.hostId
            && candidate.sessionId === session.sessionId
            && ownsSession(session, intent)
          ),
          (completed) => {
            if (
              completed.hostId === session.hostId
              && completed.sessionId === session.sessionId
              && ownsSession(session, intent)
            ) {
              release(completed);
              useFilterStore.getState().setFollowPaused(false);
            }
          },
        );
        if (!ownsSession(session, intent)) {
          if (runRef.current === session) cleanupListeners();
          return;
        }

        if (session.remote) {
          const password = (await getHostPassword(session.hostId)) ?? undefined;
          if (!ownsSession(session, intent)) {
            if (runRef.current === session) cleanupListeners();
            return;
          }
          await startRemoteFollow(session.hostId, requestedFilter, session.sessionId, password);
        } else {
          await startFollow(requestedFilter, session.sessionId);
        }
        if (!ownsSession(session, intent)) return;
        const state = useFilterStore.getState();
        state.setFollowing(true);
        state.setFollowPaused(false);
      } catch (error) {
        if (ownsSession(session, intent)) {
          const message = `Failed to start follow mode: ${error instanceof Error ? error.message : String(error)}`;
          useFollowModeStore.getState().setStartupError(message);
          useFilterStore.getState().setError(message);
          useFilterStore.getState().setFollowing(false);
          release(session);
        }
      }
    });
  }, [enqueue, ownsSession, release]);

  const start = useCallback(() => {
    if (runRef.current) return queueRef.current;
    return begin(filterRef.current, invalidateRestartIntent());
  }, [begin, invalidateRestartIntent]);
  const stop = useCallback(() => requestStop(), [requestStop]);
  const toggle = useCallback(() => (runRef.current && !runRef.current.stopping ? stop() : start()), [start, stop]);

  const pause = useCallback(() => {
    const state = useFilterStore.getState();
    if (state.isFollowing && !state.isFollowPaused) state.setFollowPaused(true);
  }, []);
  const resume = useCallback(() => {
    const state = useFilterStore.getState();
    if (state.isFollowing && state.isFollowPaused) state.setFollowPaused(false);
  }, []);

  useEffect(() => {
    invalidateRestartIntent();
    const run = runRef.current;
    if (run && !sessionSourceIsCurrent(run)) {
      requestStop(run, false);
    }
  }, [invalidateRestartIntent, isOfflineMode, layout, requestStop, sourceKey]);

  useEffect(() => {
    const previous = previousFilterRef.current;
    previousFilterRef.current = filter;
    const run = runRef.current;
    if (!previous || filtersEqual(previous, filter) || !run || run.stopping) return;

    const intent = invalidateRestartIntent();
    run.accepting = false;
    const state = useFilterStore.getState();
    state.setEntries([]);
    state.setCursorEnd(null);
    state.setHasMore(false);

    restartTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || restartIntentRef.current !== intent) return;
      const currentRun = runRef.current;
      if (!currentRun || currentRun !== run || currentRun.stopping) return;
      currentRun.stopping = true;
      const current = useFilterStore.getState();
      current.setEntries([]);
      current.setCursorEnd(null);
      current.setHasMore(false);
      enqueue(async () => {
        await stopRun(currentRun);
        if (mountedRef.current && restartIntentRef.current === intent) {
          void begin(filterRef.current, intent);
        }
      });
    }, DEBOUNCE_MS);
  }, [begin, enqueue, filter, invalidateRestartIntent, stopRun]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateRestartIntent();
      requestStop(undefined, false);
      cleanupListeners();
    };
  }, [invalidateRestartIntent, requestStop]);

  return { isFollowing, isFollowPaused, start, stop, toggle, pause, resume, isAvailable: followAvailable };
}
