import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  FollowErrorEvent,
  FollowEvent,
  FollowStoppedEvent,
  JournalEntry,
} from '../lib/types';

export interface DesiredFollowSession {
  hostId: string;
  sessionId: string;
}

interface FollowModeState {
  desiredSession: DesiredFollowSession | null;
  startupError: string | null;
  unlistenEntry: UnlistenFn | null;
  unlistenError: UnlistenFn | null;
  unlistenStopped: UnlistenFn | null;
  setDesiredSession: (session: DesiredFollowSession | null) => void;
  setStartupError: (error: string | null) => void;
  setUnlistenFns: (entry: UnlistenFn | null, error: UnlistenFn | null, stopped: UnlistenFn | null) => void;
  cleanup: () => void;
}

export const useFollowModeStore = create<FollowModeState>((set, get) => ({
  desiredSession: null,
  startupError: null,
  unlistenEntry: null,
  unlistenError: null,
  unlistenStopped: null,
  setDesiredSession: (desiredSession) => set({ desiredSession }),
  setStartupError: (startupError) => set({ startupError }),
  setUnlistenFns: (entry, error, stopped) => set({
    unlistenEntry: entry,
    unlistenError: error,
    unlistenStopped: stopped,
  }),
  cleanup: () => {
    const { unlistenEntry, unlistenError, unlistenStopped } = get();
    unlistenEntry?.();
    unlistenError?.();
    unlistenStopped?.();
    set({ unlistenEntry: null, unlistenError: null, unlistenStopped: null });
  },
}));

interface FollowListenerCallbacks {
  prependEntries: (entries: JournalEntry[]) => void;
  setError: (error: string | null) => void;
  setFollowing: (following: boolean) => void;
  acceptsSession: (session: DesiredFollowSession) => boolean;
  onTerminal: (session: DesiredFollowSession) => void;
}

let listenerSetup: Promise<void> | null = null;
let listenerCallbacks: FollowListenerCallbacks | null = null;
let listenerGeneration = 0;

function matchesDesiredSession(hostId: string, sessionId: string): boolean {
  const desired = useFollowModeStore.getState().desiredSession;
  return desired?.hostId === hostId && desired.sessionId === sessionId;
}

/** Set up one shared listener set and refresh its session-bound callbacks. */
export function setupListeners(
  prependEntries: (entries: JournalEntry[]) => void,
  setError: (error: string | null) => void,
  setFollowing: (following: boolean) => void,
  acceptsSession: (session: DesiredFollowSession) => boolean,
  onTerminal: (session: DesiredFollowSession) => void,
): Promise<void> {
  listenerCallbacks = {
    prependEntries,
    setError,
    setFollowing,
    acceptsSession,
    onTerminal,
  };

  const existing = useFollowModeStore.getState();
  if (existing.unlistenEntry && existing.unlistenError && existing.unlistenStopped) {
    return Promise.resolve();
  }
  if (listenerSetup) return listenerSetup;

  const generation = listenerGeneration;
  const setup = (async () => {
    let unlistenEntry: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;
    let unlistenStopped: UnlistenFn | null = null;
    const cancelled = () => generation !== listenerGeneration;
    const discard = () => {
      unlistenEntry?.();
      unlistenError?.();
      unlistenStopped?.();
    };

    try {
      unlistenEntry = await listen<FollowEvent>('journal-follow-entry', ({ payload }) => {
        const callbacks = listenerCallbacks;
        const session = { hostId: payload.hostId, sessionId: payload.sessionId };
        if (
          callbacks
          && matchesDesiredSession(session.hostId, session.sessionId)
          && callbacks.acceptsSession(session)
          && payload.entries.length > 0
        ) {
          callbacks.prependEntries(payload.entries);
        }
      });
      if (cancelled()) {
        discard();
        return;
      }

      unlistenError = await listen<FollowErrorEvent>('journal-follow-error', ({ payload }) => {
        const callbacks = listenerCallbacks;
        const session = { hostId: payload.hostId, sessionId: payload.sessionId };
        if (
          !callbacks
          || !matchesDesiredSession(session.hostId, session.sessionId)
          || !callbacks.acceptsSession(session)
        ) return;
        const message = `Follow mode error: ${payload.message}`;
        useFollowModeStore.getState().setStartupError(message);
        callbacks.setError(message);
        callbacks.setFollowing(false);
        callbacks.onTerminal(session);
      });
      if (cancelled()) {
        discard();
        return;
      }

      unlistenStopped = await listen<FollowStoppedEvent>('journal-follow-stopped', ({ payload }) => {
        const callbacks = listenerCallbacks;
        const session = { hostId: payload.hostId, sessionId: payload.sessionId };
        if (
          !callbacks
          || !matchesDesiredSession(session.hostId, session.sessionId)
          || !callbacks.acceptsSession(session)
        ) return;
        callbacks.setFollowing(false);
        callbacks.onTerminal(session);
      });
      if (cancelled()) {
        discard();
        return;
      }
      useFollowModeStore.getState().setUnlistenFns(unlistenEntry, unlistenError, unlistenStopped);
    } catch (error) {
      discard();
      if (!cancelled()) throw error;
    }
  })();

  listenerSetup = setup;
  return setup.finally(() => {
    if (listenerSetup === setup) listenerSetup = null;
  });
}

export function cleanupListeners(): void {
  listenerGeneration += 1;
  listenerCallbacks = null;
  listenerSetup = null;
  useFollowModeStore.getState().cleanup();
}
