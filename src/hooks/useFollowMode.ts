import { useCallback, useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useFilterStore } from '../stores/filterStore';
import { startFollow, stopFollow } from '../lib/tauri';
import type { FollowEvent, FollowErrorEvent } from '../lib/types';

// Global state to track if listeners are set up (singleton pattern)
let listenersSetUp = false;
let globalUnlistenEntry: UnlistenFn | null = null;
let globalUnlistenError: UnlistenFn | null = null;
let globalUnlistenStopped: UnlistenFn | null = null;

async function setupListeners(
  prependEntries: (entries: any[]) => void,
  setError: (error: string | null) => void,
  setFollowing: (following: boolean) => void
) {
  if (listenersSetUp) return;
  listenersSetUp = true;

  globalUnlistenEntry = await listen<FollowEvent>(
    'journal-follow-entry',
    (event) => {
      const { entries } = event.payload;
      if (entries.length > 0) {
        prependEntries(entries);
      }
    }
  );

  globalUnlistenError = await listen<FollowErrorEvent>(
    'journal-follow-error',
    (event) => {
      setError(`Follow mode error: ${event.payload.message}`);
      setFollowing(false);
    }
  );

  globalUnlistenStopped = await listen(
    'journal-follow-stopped',
    () => {
      setFollowing(false);
    }
  );
}

function cleanupListeners() {
  if (globalUnlistenEntry) {
    globalUnlistenEntry();
    globalUnlistenEntry = null;
  }
  if (globalUnlistenError) {
    globalUnlistenError();
    globalUnlistenError = null;
  }
  if (globalUnlistenStopped) {
    globalUnlistenStopped();
    globalUnlistenStopped = null;
  }
  listenersSetUp = false;
}

export function useFollowMode() {
  const {
    filter,
    isFollowing,
    isFollowPaused,
    prependEntries,
    setFollowing,
    setFollowPaused,
    setError,
  } = useFilterStore();

  const isFirstMount = useRef(true);

  // Start follow mode
  const start = useCallback(async () => {
    try {
      // Set up listeners if not already done
      await setupListeners(prependEntries, setError, setFollowing);

      // Start the follow process in Rust
      await startFollow(filter);
      setFollowing(true);
      setFollowPaused(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to start follow mode: ${errorMessage}`);
      setFollowing(false);
    }
  }, [filter, prependEntries, setError, setFollowing, setFollowPaused]);

  // Stop follow mode
  const stop = useCallback(async () => {
    try {
      await stopFollow();
    } catch (err) {
      console.error('Failed to stop follow:', err);
    }
    setFollowing(false);
    setFollowPaused(false);
    cleanupListeners();
  }, [setFollowing, setFollowPaused]);

  // Toggle follow mode
  const toggle = useCallback(async () => {
    if (isFollowing) {
      await stop();
    } else {
      await start();
    }
  }, [isFollowing, start, stop]);

  // Pause follow mode (when user scrolls up)
  const pause = useCallback(() => {
    if (isFollowing && !isFollowPaused) {
      setFollowPaused(true);
    }
  }, [isFollowing, isFollowPaused, setFollowPaused]);

  // Resume follow mode (when user scrolls to bottom or clicks resume)
  const resume = useCallback(() => {
    if (isFollowing && isFollowPaused) {
      setFollowPaused(false);
    }
  }, [isFollowing, isFollowPaused, setFollowPaused]);

  // Cleanup on unmount (only if this is the component that started follow mode)
  useEffect(() => {
    return () => {
      // Only cleanup if we're actually following
      if (isFollowing) {
        stopFollow().catch(console.error);
        cleanupListeners();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restart follow mode when filter changes (to apply new filters)
  const filterRef = useRef(filter);
  useEffect(() => {
    // Skip the initial render
    if (isFirstMount.current) {
      isFirstMount.current = false;
      filterRef.current = filter;
      return;
    }

    if (filterRef.current === filter) return;
    filterRef.current = filter;

    // If following, restart with the new filter
    if (isFollowing) {
      startFollow(filter).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to update follow filter: ${errorMessage}`);
        setFollowing(false);
      });
    }
  }, [filter, isFollowing, setError, setFollowing]);

  return {
    isFollowing,
    isFollowPaused,
    start,
    stop,
    toggle,
    pause,
    resume,
  };
}
