import { useCallback, useEffect, useRef, useMemo } from 'react';
import { useFilterStore } from '../stores/filterStore';
import { useConnectionStore } from '../stores/connectionStore';
import {
  useFollowModeStore,
  setupListeners,
  cleanupListeners,
  getFilterKey,
  DEBOUNCE_MS,
} from '../stores/followModeStore';
import {
  startFollow,
  stopFollow,
  startRemoteFollow,
  stopRemoteFollow,
  getHostPassword,
} from '../lib/tauri';
import { logError } from '../lib/errorLogger';

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

  // Access store state and actions
  const {
    lastFilterKey,
    restartInProgress,
    setLastFilterKey,
    setRestartInProgress,
    clearDebounceTimer,
    setDebounceTimer,
  } = useFollowModeStore();

  // Use refs to track state in callbacks without re-creating them
  const isRemoteRef = useRef(isRemote);
  const connectedHostIdRef = useRef(connectedHostId);
  const filterRef = useRef(filter);
  isRemoteRef.current = isRemote;
  connectedHostIdRef.current = connectedHostId;
  filterRef.current = filter;

  // Start follow mode
  const start = useCallback(async () => {
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
    // Check if filter actually changed (using store state for singleton behavior)
    if (lastFilterKey === filterKey) return;

    // Update the filter key immediately to prevent duplicate handling
    const previousKey = lastFilterKey;
    setLastFilterKey(filterKey);

    // If following, debounce and restart with the new filter
    if (isFollowing && previousKey !== null) {
      // Clear any pending debounce timer
      clearDebounceTimer();

      // Debounce the restart to avoid rapid-fire restarts while sliding
      const timer = setTimeout(() => {
        // Check if a restart is already in progress (use fresh state)
        const currentState = useFollowModeStore.getState();
        if (currentState.restartInProgress) {
          return;
        }

        setRestartInProgress(true);
        // Use filterRef.current to get the LATEST filter value, not the stale closure value
        const currentFilter = filterRef.current;

        const restartFollow = async () => {
          try {
            // Don't call stopFollow() - just call startFollow() directly.
            // The backend's start() method sets a 'restarting' flag before stopping
            // the old process, which suppresses the 'journal-follow-stopped' event.
            // If we called stopFollow() first, it would clear that flag and emit
            // the stopped event, causing the UI to show follow as disabled.
            if (isRemoteRef.current) {
              // Retrieve password from keyring for remote follow
              const hostId = connectedHostIdRef.current;
              let password: string | undefined;
              if (hostId) {
                const savedPassword = await getHostPassword(hostId);
                password = savedPassword ?? undefined;
              }
              await startRemoteFollow(currentFilter, password);
            } else {
              await startFollow(currentFilter);
            }
          } finally {
            setRestartInProgress(false);
          }
        };

        restartFollow().catch((err) => {
          setRestartInProgress(false);
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(`Failed to update follow filter: ${errorMessage}`);
          setFollowing(false);
        });
      }, DEBOUNCE_MS);

      setDebounceTimer(timer);
    }

    // Cleanup debounce timer on unmount or filter change
    return () => {
      clearDebounceTimer();
    };
  }, [
    filter,
    filterKey,
    isFollowing,
    lastFilterKey,
    setLastFilterKey,
    setRestartInProgress,
    clearDebounceTimer,
    setDebounceTimer,
    setError,
    setFollowing,
  ]);

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
