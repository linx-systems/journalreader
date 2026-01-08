import { useCallback, useEffect, useRef, useMemo } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore } from '../stores/connectionStore';
import {
  startFollow,
  stopFollow,
  startRemoteFollow,
  stopRemoteFollow,
  getHostPassword,
} from '../lib/tauri';
import { logError } from '../lib/errorLogger';
import type { FollowEvent, FollowErrorEvent } from '../lib/types';

// Helper to create a stable key from filter for comparison
function getFilterKey(filter: any): string {
  return JSON.stringify(filter);
}

// Global state to track if listeners are set up (singleton pattern)
let listenersSetUp = false;
let globalUnlistenEntry: UnlistenFn | null = null;
let globalUnlistenError: UnlistenFn | null = null;
let globalUnlistenStopped: UnlistenFn | null = null;

// Global state for filter change handling (singleton - only one instance should handle restarts)
let lastFilterKey: string | null = null;
let restartInProgress = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300; // Debounce filter changes by 300ms

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

  const { connectedHostId, connectionStatus } = useConnectionStore();
  const isRemote = connectionStatus === 'connected' && connectedHostId !== null;

  // Use refs to track state in callbacks without re-creating them
  const isRemoteRef = useRef(isRemote);
  const connectedHostIdRef = useRef(connectedHostId);
  isRemoteRef.current = isRemote;
  connectedHostIdRef.current = connectedHostId;

  // Start follow mode
  const start = useCallback(async () => {
    console.log('[useFollowMode] start() called with filter:', filter);
    console.log('[useFollowMode] isRemote:', isRemoteRef.current);
    try {
      // Set up listeners if not already done
      await setupListeners(prependEntries, setError, setFollowing);

      // Start the follow process in Rust (remote or local)
      if (isRemoteRef.current) {
        // For remote connections, retrieve password from keyring if available
        // The session password is cleared after initial connection, so we need
        // to get it from the keyring for the follow mode's separate SSH connection
        const hostId = connectedHostIdRef.current;
        let password: string | undefined;
        if (hostId) {
          const savedPassword = await getHostPassword(hostId);
          password = savedPassword ?? undefined;
        }
        console.log('[useFollowMode] Calling startRemoteFollow with filter:', filter);
        await startRemoteFollow(filter, password);
      } else {
        await startFollow(filter);
      }
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
      // Stop both local and remote - only the active one will actually do anything
      await Promise.all([
        stopFollow().catch(() => {}),
        stopRemoteFollow().catch(() => {}),
      ]);
    } catch (err) {
      logError(err, { component: 'useFollowMode', action: 'stopFollow' });
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
        stopFollow().catch((err) =>
          logError(err, { component: 'useFollowMode', action: 'cleanup:stopFollow' })
        );
        stopRemoteFollow().catch((err) =>
          logError(err, { component: 'useFollowMode', action: 'cleanup:stopRemoteFollow' })
        );
        cleanupListeners();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restart follow mode when filter changes (to apply new filters)
  // Use JSON stringification to detect actual filter changes (not reference changes)
  const filterKey = useMemo(() => getFilterKey(filter), [filter]);

  useEffect(() => {
    // Check if filter actually changed (using global state for singleton behavior)
    if (lastFilterKey === filterKey) return;

    // Update the global filter key immediately to prevent duplicate handling
    const previousKey = lastFilterKey;
    lastFilterKey = filterKey;

    // If following, debounce and restart with the new filter
    if (isFollowing && previousKey !== null) {
      // Clear any pending debounce timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Debounce the restart to avoid rapid-fire restarts while sliding
      debounceTimer = setTimeout(() => {
        // Check if a restart is already in progress
        if (restartInProgress) {
          console.log('[useFollowMode] Restart already in progress, skipping');
          return;
        }

        restartInProgress = true;
        console.log('[useFollowMode] Filter changed while following, restarting with:', filter);

        const restartFollow = async () => {
          try {
            // First stop the current follow to ensure clean state
            if (isRemoteRef.current) {
              await stopRemoteFollow().catch(() => {});
            } else {
              await stopFollow().catch(() => {});
            }

            // Small delay to ensure the old connection is fully stopped
            await new Promise(resolve => setTimeout(resolve, 100));

            if (isRemoteRef.current) {
              // Retrieve password from keyring for remote follow
              const hostId = connectedHostIdRef.current;
              let password: string | undefined;
              if (hostId) {
                const savedPassword = await getHostPassword(hostId);
                password = savedPassword ?? undefined;
              }
              console.log('[useFollowMode] Restarting remote follow with filter:', filter);
              await startRemoteFollow(filter, password);
            } else {
              console.log('[useFollowMode] Restarting local follow with filter:', filter);
              await startFollow(filter);
            }
          } finally {
            restartInProgress = false;
          }
        };

        restartFollow().catch((err) => {
          restartInProgress = false;
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to update follow filter: ${errorMessage}`);
          setFollowing(false);
        });
      }, DEBOUNCE_MS);
    }

    // Cleanup debounce timer on unmount or filter change
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [filter, filterKey, isFollowing, setError, setFollowing]);

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
