import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFollowMode } from '../useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFollowModeStore, DEBOUNCE_MS } from '../../stores/followModeStore';
import type { JournalFilter } from '../../lib/types';

// Mock Tauri modules
vi.mock('../../lib/tauri', () => ({
  startFollow: vi.fn(),
  stopFollow: vi.fn(),
  startRemoteFollow: vi.fn(),
  stopRemoteFollow: vi.fn(),
  getHostPassword: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../../lib/errorLogger', () => ({
  logError: vi.fn(),
}));

import {
  startFollow,
  stopFollow,
  startRemoteFollow,
  stopRemoteFollow,
  getHostPassword,
} from '../../lib/tauri';
import { listen } from '@tauri-apps/api/event';
import { logError } from '../../lib/errorLogger';

const mockStartFollow = vi.mocked(startFollow);
const mockStopFollow = vi.mocked(stopFollow);
const mockStartRemoteFollow = vi.mocked(startRemoteFollow);
const mockStopRemoteFollow = vi.mocked(stopRemoteFollow);
const mockGetHostPassword = vi.mocked(getHostPassword);
const mockListen = vi.mocked(listen);
const mockLogError = vi.mocked(logError);

// Helper to create a default filter
const createFilter = (overrides: Partial<JournalFilter> = {}): JournalFilter => ({
  units: [],
  excludedUnits: [],
  caseSensitive: false,
  limit: 500,
  reverse: true,
  ...overrides,
});

// Helper to reset all stores to initial state
function resetStores() {
  // Reset filter store
  useFilterStore.setState({
    filter: createFilter({ since: '15 minutes ago' }),
    entries: [],
    isLoading: false,
    error: null,
    hasMore: false,
    cursorEnd: null,
    isFollowing: false,
    isFollowPaused: false,
  });

  // Reset connection store
  useConnectionStore.setState({
    hosts: [],
    isLoadingHosts: false,
    hostsError: null,
    connectedHostId: null,
    connectionStatus: 'disconnected',
    connectionError: null,
    sessionPassword: null,
    openTabs: ['local'],
    activeTabId: 'local',
  });

  // Reset follow mode store
  useFollowModeStore.setState({
    listenersSetUp: false,
    unlistenEntry: null,
    unlistenError: null,
    unlistenStopped: null,
    lastFilter: null,
    restartInProgress: false,
    debounceTimer: null,
  });
}

// Helper to flush all pending promises and timers
async function flushPromisesAndTimers() {
  // Run all pending microtasks
  await Promise.resolve();
  // Run any timers that became ready
  vi.runAllTimers();
  // Run any promises that were queued by the timers
  await Promise.resolve();
}

describe('useFollowMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetStores();

    // Default mock implementations
    mockStartFollow.mockResolvedValue(undefined);
    mockStopFollow.mockResolvedValue(undefined);
    mockStartRemoteFollow.mockResolvedValue(undefined);
    mockStopRemoteFollow.mockResolvedValue(undefined);
    mockGetHostPassword.mockResolvedValue(null);

    // Mock listen to return a cleanup function
    mockListen.mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Core Functionality', () => {
    describe('start()', () => {
      it('initiates follow mode and sets isFollowing to true', async () => {
        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.start();
        });

        expect(mockStartFollow).toHaveBeenCalledTimes(1);
        expect(useFilterStore.getState().isFollowing).toBe(true);
        expect(useFilterStore.getState().isFollowPaused).toBe(false);
      });

      it('passes current filter to startFollow', async () => {
        const customFilter = createFilter({ units: ['nginx.service'], since: '1 hour ago' });
        useFilterStore.setState({ filter: customFilter });

        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.start();
        });

        expect(mockStartFollow).toHaveBeenCalledWith(customFilter);
      });

      it('sets up event listeners on first start', async () => {
        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.start();
        });

        expect(mockListen).toHaveBeenCalledWith('journal-follow-entry', expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith('journal-follow-error', expect.any(Function));
        expect(mockListen).toHaveBeenCalledWith('journal-follow-stopped', expect.any(Function));
      });
    });

    describe('stop()', () => {
      it('stops follow mode and sets isFollowing to false', async () => {
        // Start first
        useFilterStore.setState({ isFollowing: true });
        useFollowModeStore.setState({ listenersSetUp: true });

        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.stop();
        });

        expect(mockStopFollow).toHaveBeenCalledTimes(1);
        expect(mockStopRemoteFollow).toHaveBeenCalledTimes(1);
        expect(useFilterStore.getState().isFollowing).toBe(false);
        expect(useFilterStore.getState().isFollowPaused).toBe(false);
      });

      it('cleans up event listeners', async () => {
        const mockUnlisten = vi.fn();
        useFollowModeStore.setState({
          listenersSetUp: true,
          unlistenEntry: mockUnlisten,
          unlistenError: mockUnlisten,
          unlistenStopped: mockUnlisten,
        });
        useFilterStore.setState({ isFollowing: true });

        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.stop();
        });

        expect(mockUnlisten).toHaveBeenCalledTimes(3);
        expect(useFollowModeStore.getState().listenersSetUp).toBe(false);
      });

      it('stops both local and remote (only active one does anything)', async () => {
        useFilterStore.setState({ isFollowing: true });

        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.stop();
        });

        expect(mockStopFollow).toHaveBeenCalledTimes(1);
        expect(mockStopRemoteFollow).toHaveBeenCalledTimes(1);
      });
    });

    describe('toggle()', () => {
      it('starts follow mode when not following', async () => {
        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.toggle();
        });

        expect(mockStartFollow).toHaveBeenCalledTimes(1);
        expect(useFilterStore.getState().isFollowing).toBe(true);
      });

      it('stops follow mode when already following', async () => {
        useFilterStore.setState({ isFollowing: true });

        const { result } = renderHook(() => useFollowMode());

        await act(async () => {
          await result.current.toggle();
        });

        expect(mockStopFollow).toHaveBeenCalledTimes(1);
        expect(useFilterStore.getState().isFollowing).toBe(false);
      });
    });

    describe('pause()', () => {
      it('pauses when following and not already paused', () => {
        useFilterStore.setState({ isFollowing: true, isFollowPaused: false });

        const { result } = renderHook(() => useFollowMode());

        act(() => {
          result.current.pause();
        });

        expect(useFilterStore.getState().isFollowPaused).toBe(true);
      });

      it('does nothing when already paused', () => {
        useFilterStore.setState({ isFollowing: true, isFollowPaused: true });
        const initialPausedState = useFilterStore.getState().isFollowPaused;

        const { result } = renderHook(() => useFollowMode());

        act(() => {
          result.current.pause();
        });

        // State should remain unchanged
        expect(useFilterStore.getState().isFollowPaused).toBe(initialPausedState);
      });

      it('does nothing when not following', () => {
        useFilterStore.setState({ isFollowing: false, isFollowPaused: false });

        const { result } = renderHook(() => useFollowMode());

        act(() => {
          result.current.pause();
        });

        // Should still be false since we're not following
        expect(useFilterStore.getState().isFollowPaused).toBe(false);
      });
    });

    describe('resume()', () => {
      it('resumes when following and paused', () => {
        useFilterStore.setState({ isFollowing: true, isFollowPaused: true });

        const { result } = renderHook(() => useFollowMode());

        // Verify initial state
        expect(result.current.isFollowPaused).toBe(true);

        act(() => {
          result.current.resume();
        });

        expect(result.current.isFollowPaused).toBe(false);
        expect(useFilterStore.getState().isFollowPaused).toBe(false);
      });

      it('does nothing when not paused', () => {
        useFilterStore.setState({ isFollowing: true, isFollowPaused: false });

        const { result } = renderHook(() => useFollowMode());

        act(() => {
          result.current.resume();
        });

        // State should remain unchanged
        expect(useFilterStore.getState().isFollowPaused).toBe(false);
      });

      it('does nothing when not following', () => {
        useFilterStore.setState({ isFollowing: false, isFollowPaused: true });

        const { result } = renderHook(() => useFollowMode());

        act(() => {
          result.current.resume();
        });

        // Should still be true since we're not following (resume won't do anything)
        expect(useFilterStore.getState().isFollowPaused).toBe(true);
      });
    });
  });

  describe('Event Listener Management', () => {
    it('sets up listeners only once (singleton pattern)', async () => {
      const { result: result1 } = renderHook(() => useFollowMode());
      const { result: result2 } = renderHook(() => useFollowMode());

      // Start from first hook
      await act(async () => {
        await result1.current.start();
      });

      // Listeners should be set up
      expect(mockListen).toHaveBeenCalledTimes(3);

      // Start from second hook
      await act(async () => {
        await result2.current.start();
      });

      // Listeners should not be set up again
      expect(mockListen).toHaveBeenCalledTimes(3);
    });

    it('processes journal-follow-entry events', async () => {
      let entryHandler: (event: { payload: { entries: unknown[] } }) => void = () => {};
      mockListen.mockImplementation(async (event, handler) => {
        if (event === 'journal-follow-entry') {
          entryHandler = handler as typeof entryHandler;
        }
        return () => {};
      });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      // Simulate receiving entries
      const testEntry = {
        cursor: 'test-cursor',
        realtimeTimestamp: Date.now() * 1000,
        bootId: 'boot-1',
        message: 'Test message',
        priority: 6,
      };

      act(() => {
        entryHandler({ payload: { entries: [testEntry] } });
      });

      expect(useFilterStore.getState().entries).toHaveLength(1);
      expect(useFilterStore.getState().entries[0]).toEqual(testEntry);
    });

    it('processes journal-follow-error events', async () => {
      let errorHandler: (event: { payload: { message: string } }) => void = () => {};
      mockListen.mockImplementation(async (event, handler) => {
        if (event === 'journal-follow-error') {
          errorHandler = handler as typeof errorHandler;
        }
        return () => {};
      });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(useFilterStore.getState().isFollowing).toBe(true);

      // Simulate error event
      act(() => {
        errorHandler({ payload: { message: 'Connection lost' } });
      });

      expect(useFilterStore.getState().error).toBe('Follow mode error: Connection lost');
      expect(useFilterStore.getState().isFollowing).toBe(false);
    });

    it('processes journal-follow-stopped events', async () => {
      let stoppedHandler: () => void = () => {};
      mockListen.mockImplementation(async (event, handler) => {
        if (event === 'journal-follow-stopped') {
          stoppedHandler = handler as typeof stoppedHandler;
        }
        return () => {};
      });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(useFilterStore.getState().isFollowing).toBe(true);

      // Simulate stopped event
      act(() => {
        stoppedHandler();
      });

      expect(useFilterStore.getState().isFollowing).toBe(false);
    });

    it('cleans up listeners on stop', async () => {
      const mockUnlistenEntry = vi.fn();
      const mockUnlistenError = vi.fn();
      const mockUnlistenStopped = vi.fn();

      mockListen.mockImplementation(async (event) => {
        if (event === 'journal-follow-entry') return mockUnlistenEntry;
        if (event === 'journal-follow-error') return mockUnlistenError;
        if (event === 'journal-follow-stopped') return mockUnlistenStopped;
        return () => {};
      });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      await act(async () => {
        await result.current.stop();
      });

      expect(mockUnlistenEntry).toHaveBeenCalled();
      expect(mockUnlistenError).toHaveBeenCalled();
      expect(mockUnlistenStopped).toHaveBeenCalled();
    });

    it('cleans up on component unmount while following', async () => {
      useFilterStore.setState({ isFollowing: true });

      const { unmount } = renderHook(() => useFollowMode());

      unmount();

      expect(mockStopFollow).toHaveBeenCalled();
      expect(mockStopRemoteFollow).toHaveBeenCalled();
    });
  });

  describe('Filter Changes', () => {
    it('effect synchronizes filter to lastFilter on mount', async () => {
      // Set a different filter value
      const testFilter = createFilter({ units: ['test.service'], since: '1 hour ago' });
      useFilterStore.setState({ filter: testFilter });
      useFollowModeStore.setState({ lastFilter: null });

      const { result } = renderHook(() => useFollowMode());

      // After hook renders, the effect should have synchronized lastFilter
      await act(async () => {
        await Promise.resolve();
      });

      // lastFilter should match the current filter
      const lastFilter = useFollowModeStore.getState().lastFilter;
      expect(lastFilter).not.toBeNull();
      expect(lastFilter?.units).toEqual(['test.service']);
    });

    it('clearDebounceTimer clears any pending timer', () => {
      // Set up a timer
      const timer = setTimeout(() => {}, 1000);
      useFollowModeStore.setState({ debounceTimer: timer });

      // Clear it
      useFollowModeStore.getState().clearDebounceTimer();

      expect(useFollowModeStore.getState().debounceTimer).toBeNull();
    });

    it('uses restartInProgress flag to prevent duplicate restarts', async () => {
      vi.useRealTimers();

      const { result, rerender } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      // Simulate restart in progress
      useFollowModeStore.setState({ restartInProgress: true });

      // Change filter
      act(() => {
        useFilterStore.getState().setFilter({ units: ['nginx.service'] });
      });
      rerender();

      // Wait for debounce
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 100));
      });

      // Should not restart because restartInProgress is true
      expect(mockStartFollow).toHaveBeenCalledTimes(1);
    });

    it('does not restart when filter has not actually changed', async () => {
      const { result, rerender } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(mockStartFollow).toHaveBeenCalledTimes(1);

      // Rerender without changing filter
      rerender();

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS + 50);
      });

      // Should not restart
      expect(mockStartFollow).toHaveBeenCalledTimes(1);
    });

    it('does not restart when not following', async () => {
      renderHook(() => useFollowMode());

      // Change filter without starting follow mode
      act(() => {
        useFilterStore.getState().setFilter({ units: ['nginx.service'] });
      });

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS + 50);
      });

      // Should not have started
      expect(mockStartFollow).not.toHaveBeenCalled();
    });

    it('clears debounce timer on unmount', async () => {
      vi.useRealTimers();

      const { result, unmount, rerender } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      // Change filter to trigger debounce
      act(() => {
        useFilterStore.getState().setFilter({ units: ['nginx.service'] });
      });
      rerender();

      // Unmount before debounce expires
      unmount();

      // Wait past debounce time
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 100));
      });

      // Only the initial start should have happened (the restart was canceled)
      expect(mockStartFollow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Remote Mode', () => {
    beforeEach(() => {
      // Set up for remote connection
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
    });

    it('uses startRemoteFollow for remote connections', async () => {
      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(mockStartRemoteFollow).toHaveBeenCalledTimes(1);
      expect(mockStartFollow).not.toHaveBeenCalled();
    });

    it('retrieves password from keyring for remote follow', async () => {
      mockGetHostPassword.mockResolvedValue('secret-password');

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(mockGetHostPassword).toHaveBeenCalledWith('host-123');
      expect(mockStartRemoteFollow).toHaveBeenCalledWith(
        expect.any(Object),
        'secret-password'
      );
    });

    it('handles missing password gracefully', async () => {
      mockGetHostPassword.mockResolvedValue(null);

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(mockGetHostPassword).toHaveBeenCalledWith('host-123');
      expect(mockStartRemoteFollow).toHaveBeenCalledWith(
        expect.any(Object),
        undefined
      );
      expect(useFilterStore.getState().isFollowing).toBe(true);
    });

    it('remote mode is correctly detected based on connection state', async () => {
      const { result, rerender } = renderHook(() => useFollowMode());

      // Start in remote mode
      await act(async () => {
        await result.current.start();
      });

      expect(mockStartRemoteFollow).toHaveBeenCalledTimes(1);
      expect(mockStartFollow).not.toHaveBeenCalled();

      // Stop
      await act(async () => {
        await result.current.stop();
      });

      // Switch to local mode
      act(() => {
        useConnectionStore.setState({
          connectedHostId: null,
          connectionStatus: 'disconnected',
        });
      });
      rerender();

      // Start again - should use local now
      await act(async () => {
        await result.current.start();
      });

      expect(mockStartFollow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('sets error state when start fails', async () => {
      mockStartFollow.mockRejectedValue(new Error('Failed to start journalctl'));

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(useFilterStore.getState().error).toBe(
        'Failed to start follow mode: Failed to start journalctl'
      );
      expect(useFilterStore.getState().isFollowing).toBe(false);
    });

    it('handles non-Error exceptions in start', async () => {
      mockStartFollow.mockRejectedValue('string error');

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(useFilterStore.getState().error).toBe(
        'Failed to start follow mode: string error'
      );
    });

    it('logs stop errors but does not crash', async () => {
      useFilterStore.setState({ isFollowing: true });
      mockStopFollow.mockRejectedValue(new Error('Stop failed'));

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.stop();
      });

      expect(mockLogError).toHaveBeenCalled();
      expect(useFilterStore.getState().isFollowing).toBe(false);
    });

    it('sets error when listener setup fails', async () => {
      mockListen.mockRejectedValue(new Error('Failed to set up listener'));

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(useFilterStore.getState().error).toContain('Failed to start follow mode');
      expect(useFilterStore.getState().isFollowing).toBe(false);
      // listenersSetUp should be reset on failure
      expect(useFollowModeStore.getState().listenersSetUp).toBe(false);
    });

    it('error state can be set via setError action', () => {
      // Test that the error state mechanism works
      useFilterStore.getState().setError('Test error message');
      expect(useFilterStore.getState().error).toBe('Test error message');

      useFilterStore.getState().setError(null);
      expect(useFilterStore.getState().error).toBeNull();
    });

    it('restartInProgress can be set and reset', () => {
      // Test the restartInProgress state mechanism
      expect(useFollowModeStore.getState().restartInProgress).toBe(false);

      useFollowModeStore.getState().setRestartInProgress(true);
      expect(useFollowModeStore.getState().restartInProgress).toBe(true);

      useFollowModeStore.getState().setRestartInProgress(false);
      expect(useFollowModeStore.getState().restartInProgress).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid start/stop cycles', async () => {
      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
        await result.current.stop();
        await result.current.start();
        await result.current.stop();
      });

      expect(useFilterStore.getState().isFollowing).toBe(false);
      expect(mockStartFollow).toHaveBeenCalledTimes(2);
      expect(mockStopFollow).toHaveBeenCalledTimes(2);
    });

    it('filterRef is updated on each render', async () => {
      const { result, rerender } = renderHook(() => useFollowMode());

      // Change filter
      act(() => {
        useFilterStore.getState().setFilter({ units: ['nginx.service'] });
      });
      rerender();

      // Verify filter changed in store
      expect(useFilterStore.getState().filter.units).toEqual(['nginx.service']);
    });

    it('cleanup function clears debounce timer', () => {
      const timer = setTimeout(() => {}, 1000);
      useFollowModeStore.setState({ debounceTimer: timer });

      // Verify timer is set
      expect(useFollowModeStore.getState().debounceTimer).not.toBeNull();

      // Call cleanup
      useFollowModeStore.getState().cleanup();

      // Timer should be cleared
      expect(useFollowModeStore.getState().debounceTimer).toBeNull();
    });

    it('multiple hook instances share listener state', async () => {
      const { result: result1 } = renderHook(() => useFollowMode());
      const { result: result2 } = renderHook(() => useFollowMode());

      await act(async () => {
        await result1.current.start();
      });

      // Both should see the same following state
      expect(result1.current.isFollowing).toBe(true);
      expect(result2.current.isFollowing).toBe(true);

      // Stop from second instance
      await act(async () => {
        await result2.current.stop();
      });

      // Both should see following as false
      expect(result1.current.isFollowing).toBe(false);
      expect(result2.current.isFollowing).toBe(false);
    });

    it('handles switching from local to remote mid-session', async () => {
      const { result, rerender } = renderHook(() => useFollowMode());

      // Start in local mode
      await act(async () => {
        await result.current.start();
      });

      expect(mockStartFollow).toHaveBeenCalledTimes(1);
      expect(mockStartRemoteFollow).not.toHaveBeenCalled();

      // Switch to remote (this simulates connecting to a remote host)
      act(() => {
        useConnectionStore.setState({
          connectedHostId: 'host-123',
          connectionStatus: 'connected',
        });
      });
      rerender();

      // Stop and restart
      await act(async () => {
        await result.current.stop();
        await result.current.start();
      });

      expect(mockStartRemoteFollow).toHaveBeenCalledTimes(1);
    });

    it('returns correct values from hook', async () => {
      useFilterStore.setState({
        isFollowing: true,
        isFollowPaused: true,
      });

      const { result } = renderHook(() => useFollowMode());

      expect(result.current.isFollowing).toBe(true);
      expect(result.current.isFollowPaused).toBe(true);
      expect(typeof result.current.start).toBe('function');
      expect(typeof result.current.stop).toBe('function');
      expect(typeof result.current.toggle).toBe('function');
      expect(typeof result.current.pause).toBe('function');
      expect(typeof result.current.resume).toBe('function');
    });

    it('ignores empty entry arrays from events', async () => {
      let entryHandler: (event: { payload: { entries: unknown[] } }) => void = () => {};
      mockListen.mockImplementation(async (event, handler) => {
        if (event === 'journal-follow-entry') {
          entryHandler = handler as typeof entryHandler;
        }
        return () => {};
      });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      // Simulate receiving empty entries array
      act(() => {
        entryHandler({ payload: { entries: [] } });
      });

      expect(useFilterStore.getState().entries).toHaveLength(0);
    });

    it('start() uses the current filter value', async () => {
      const customFilter = createFilter({ units: ['custom.service'], since: '1 day ago' });
      useFilterStore.setState({ filter: customFilter });

      const { result } = renderHook(() => useFollowMode());

      await act(async () => {
        await result.current.start();
      });

      expect(mockStartFollow).toHaveBeenCalledWith(customFilter);
    });
  });
});
