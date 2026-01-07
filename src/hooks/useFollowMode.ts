import { useCallback, useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useFilterStore } from '../stores/filterStore';
import { startFollow, stopFollow } from '../lib/tauri';
import type { FollowEvent, FollowErrorEvent } from '../lib/types';

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

  const unlistenEntryRef = useRef<UnlistenFn | null>(null);
  const unlistenErrorRef = useRef<UnlistenFn | null>(null);
  const unlistenStoppedRef = useRef<UnlistenFn | null>(null);

  // Cleanup function
  const cleanup = useCallback(async () => {
    if (unlistenEntryRef.current) {
      unlistenEntryRef.current();
      unlistenEntryRef.current = null;
    }
    if (unlistenErrorRef.current) {
      unlistenErrorRef.current();
      unlistenErrorRef.current = null;
    }
    if (unlistenStoppedRef.current) {
      unlistenStoppedRef.current();
      unlistenStoppedRef.current = null;
    }
  }, []);

  // Start follow mode
  const start = useCallback(async () => {
    try {
      // Clean up any existing listeners
      await cleanup();

      // Set up event listeners before starting
      unlistenEntryRef.current = await listen<FollowEvent>(
        'journal-follow-entry',
        (event) => {
          const { entries } = event.payload;
          if (entries.length > 0) {
            // Prepend new entries to the top (newest first)
            prependEntries(entries);
          }
        }
      );

      unlistenErrorRef.current = await listen<FollowErrorEvent>(
        'journal-follow-error',
        (event) => {
          setError(`Follow mode error: ${event.payload.message}`);
          setFollowing(false);
        }
      );

      unlistenStoppedRef.current = await listen(
        'journal-follow-stopped',
        () => {
          setFollowing(false);
        }
      );

      // Start the follow process in Rust
      await startFollow(filter);
      setFollowing(true);
      setFollowPaused(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to start follow mode: ${errorMessage}`);
      setFollowing(false);
      await cleanup();
    }
  }, [filter, prependEntries, setError, setFollowing, setFollowPaused, cleanup]);

  // Stop follow mode
  const stop = useCallback(async () => {
    try {
      await stopFollow();
    } catch (err) {
      console.error('Failed to stop follow:', err);
    }
    setFollowing(false);
    setFollowPaused(false);
    await cleanup();
  }, [setFollowing, setFollowPaused, cleanup]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop follow mode when component unmounts
      stopFollow().catch(console.error);
      cleanup();
    };
  }, [cleanup]);

  // Stop follow mode when filter changes
  useEffect(() => {
    if (isFollowing) {
      stop();
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

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
