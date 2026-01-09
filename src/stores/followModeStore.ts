import { create } from 'zustand';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { JournalEntry, JournalFilter, FollowEvent, FollowErrorEvent } from '../lib/types';

/**
 * Centralized store for follow mode state management.
 *
 * This store replaces the module-level global variables that were previously
 * used in useFollowMode.ts, which caused race conditions when multiple
 * components mounted/unmounted simultaneously.
 *
 * The store provides:
 * - Atomic state updates via Zustand
 * - Proper cleanup tracking for Tauri event listeners
 * - Debounce and restart coordination without race conditions
 */

interface FollowModeState {
  // Listener management
  listenersSetUp: boolean;
  unlistenEntry: UnlistenFn | null;
  unlistenError: UnlistenFn | null;
  unlistenStopped: UnlistenFn | null;

  // Filter change handling
  lastFilter: JournalFilter | null;
  restartInProgress: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  setListenersSetUp: (value: boolean) => void;
  setUnlistenFns: (entry: UnlistenFn | null, error: UnlistenFn | null, stopped: UnlistenFn | null) => void;
  setLastFilter: (filter: JournalFilter | null) => void;
  setRestartInProgress: (value: boolean) => void;
  setDebounceTimer: (timer: ReturnType<typeof setTimeout> | null) => void;
  clearDebounceTimer: () => void;
  cleanup: () => void;
}

export const useFollowModeStore = create<FollowModeState>((set, get) => ({
  // Initial state
  listenersSetUp: false,
  unlistenEntry: null,
  unlistenError: null,
  unlistenStopped: null,
  lastFilter: null,
  restartInProgress: false,
  debounceTimer: null,

  setListenersSetUp: (value) => set({ listenersSetUp: value }),

  setUnlistenFns: (entry, error, stopped) => set({
    unlistenEntry: entry,
    unlistenError: error,
    unlistenStopped: stopped,
  }),

  setLastFilter: (filter) => set({ lastFilter: filter }),

  setRestartInProgress: (value) => set({ restartInProgress: value }),

  setDebounceTimer: (timer) => set({ debounceTimer: timer }),

  clearDebounceTimer: () => {
    const { debounceTimer } = get();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      set({ debounceTimer: null });
    }
  },

  cleanup: () => {
    const state = get();

    // Clear debounce timer
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    // Call unlisten functions
    if (state.unlistenEntry) {
      state.unlistenEntry();
    }
    if (state.unlistenError) {
      state.unlistenError();
    }
    if (state.unlistenStopped) {
      state.unlistenStopped();
    }

    // Reset state
    set({
      listenersSetUp: false,
      unlistenEntry: null,
      unlistenError: null,
      unlistenStopped: null,
      debounceTimer: null,
    });
  },
}));

// Constants
export const DEBOUNCE_MS = 300;

/**
 * Set up Tauri event listeners for follow mode.
 * This is idempotent - calling it multiple times is safe.
 */
export async function setupListeners(
  prependEntries: (entries: JournalEntry[]) => void,
  setError: (error: string | null) => void,
  setFollowing: (following: boolean) => void
): Promise<void> {
  const store = useFollowModeStore.getState();

  // Already set up - no-op
  if (store.listenersSetUp) return;

  // Mark as setting up immediately to prevent concurrent setup
  store.setListenersSetUp(true);

  try {
    const unlistenEntry = await listen<FollowEvent>(
      'journal-follow-entry',
      (event) => {
        const { entries } = event.payload;
        if (entries.length > 0) {
          prependEntries(entries);
        }
      }
    );

    const unlistenError = await listen<FollowErrorEvent>(
      'journal-follow-error',
      (event) => {
        setError(`Follow mode error: ${event.payload.message}`);
        setFollowing(false);
      }
    );

    const unlistenStopped = await listen(
      'journal-follow-stopped',
      () => {
        setFollowing(false);
      }
    );

    store.setUnlistenFns(unlistenEntry, unlistenError, unlistenStopped);
  } catch (error) {
    // Reset on failure so we can retry
    store.setListenersSetUp(false);
    throw error;
  }
}

/**
 * Clean up Tauri event listeners.
 * This is idempotent - calling it multiple times is safe.
 */
export function cleanupListeners(): void {
  useFollowModeStore.getState().cleanup();
}
