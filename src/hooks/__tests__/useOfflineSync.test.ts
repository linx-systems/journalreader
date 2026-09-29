import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOfflineSync, _resetListenersForTesting } from '../useOfflineSync';
import { useConnectionStore } from '../../stores/connectionStore';
import { useOfflineStore } from '../../stores/offlineStore';
import type { SyncProgressEvent, SyncState } from '../../lib/offlineTypes';

// Mock Tauri event API
const mockListenCallbacks = new Map<string, (event: { payload: unknown }) => void>();
const mockUnlistenFns = new Map<string, () => void>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (eventName: string, callback: (event: { payload: unknown }) => void) => {
    mockListenCallbacks.set(eventName, callback);
    const unlisten = vi.fn();
    mockUnlistenFns.set(eventName, unlisten);
    return unlisten;
  }),
}));

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock the offlineTauri module
vi.mock('../../lib/offlineTauri', () => ({
  getAllSyncStates: vi.fn().mockResolvedValue([]),
  getAllStorageStats: vi.fn().mockResolvedValue([]),
  getOfflineSettings: vi.fn().mockResolvedValue({
    enabled: true,
    retentionDays: 30,
    maxEntries: 100000,
    autoSync: true,
  }),
  updateOfflineSettings: vi.fn(),
  isOfflineMode: vi.fn().mockResolvedValue(false),
  setOfflineMode: vi.fn(),
  triggerSync: vi.fn(),
  cancelSync: vi.fn(),
  deleteOfflineLogs: vi.fn(),
}));

// Store initial states for reset
const connectionInitialState = useConnectionStore.getState();
const offlineInitialState = useOfflineStore.getState();

// Helper to emit events
function emitEvent(eventName: string, payload: unknown) {
  const callback = mockListenCallbacks.get(eventName);
  if (callback) {
    callback({ payload });
  }
}

describe('useOfflineSync', () => {
  beforeEach(() => {
    // Reset stores
    useConnectionStore.setState(connectionInitialState, true);
    useOfflineStore.setState(offlineInitialState, true);
    // Reset listener state
    _resetListenersForTesting();
    // Clear event mocks
    mockListenCallbacks.clear();
    mockUnlistenFns.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _resetListenersForTesting();
  });

  describe('initial state', () => {
    it('returns undefined syncState when no host is connected', () => {
      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.syncState).toBeUndefined();
      expect(result.current.hostId).toBe('local');
    });

    it('returns correct hostId when connected', () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.hostId).toBe('host-123');
    });

    it('returns syncState for connected host', () => {
      const syncState: SyncState = {
        hostId: 'host-123',
        lastSyncTimestamp: 1000,
        lastCursor: 'cursor-1',
        syncStatus: 'completed',
        syncError: null,
        entriesSynced: 100,
      };
      const syncStates = new Map<string, SyncState>();
      syncStates.set('host-123', syncState);

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ syncStates });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.syncState).toEqual(syncState);
      expect(result.current.lastSyncTime).toBe(1000);
    });
  });

  describe('isOffline', () => {
    it('is false when connected and not in offline mode', () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ isOfflineMode: false });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.isOffline).toBe(false);
    });

    it('is true when in explicit offline mode', () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ isOfflineMode: true });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.isOffline).toBe(true);
    });

  });

  describe('isSyncing', () => {
    it('is false when currentSync is null', () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ currentSync: null });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.isSyncing).toBe(false);
    });

    it('is true when currentSync matches current host', () => {
      const currentSync: SyncProgressEvent = {
        hostId: 'host-123',
        status: 'fetching',
        entriesSynced: 50,
        totalEntries: 100,
        batchSize: 50,
        error: null,
      };

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ currentSync });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.isSyncing).toBe(true);
      expect(result.current.currentProgress).toEqual(currentSync);
    });

    it('is true when currentSync is for a different host', () => {
      const currentSync: SyncProgressEvent = {
        hostId: 'other-host',
        status: 'fetching',
        entriesSynced: 50,
        totalEntries: 100,
        batchSize: 50,
        error: null,
      };

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ currentSync });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.isSyncing).toBe(true);
      expect(result.current.currentProgress).toEqual(currentSync);
    });
  });

  describe('lastSyncTime', () => {
    it('is null when never synced', () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.lastSyncTime).toBeNull();
    });

    it('returns last sync timestamp from sync state', () => {
      const syncState: SyncState = {
        hostId: 'host-123',
        lastSyncTimestamp: 1234567890,
        lastCursor: null,
        syncStatus: 'completed',
        syncError: null,
        entriesSynced: 50,
      };
      const syncStates = new Map<string, SyncState>();
      syncStates.set('host-123', syncState);

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ syncStates });

      const { result } = renderHook(() => useOfflineSync());

      expect(result.current.lastSyncTime).toBe(1234567890);
    });
  });

  describe('event listeners', () => {
    it('sets up sync-progress listener on mount', async () => {
      renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-progress')).toBe(true);
      });
    });

    it('sets up sync-completed listener on mount', async () => {
      renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-completed')).toBe(true);
      });
    });

    it('sets up sync-failed listener on mount', async () => {
      renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-failed')).toBe(true);
      });
    });

    it('cleans up listeners on unmount', async () => {
      const { unmount } = renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-progress')).toBe(true);
      });

      unmount();

      // Listeners should have been cleaned up
      expect(mockUnlistenFns.get('sync-progress')).toHaveBeenCalled();
      expect(mockUnlistenFns.get('sync-completed')).toHaveBeenCalled();
      expect(mockUnlistenFns.get('sync-failed')).toHaveBeenCalled();
    });

    it('updates sync progress when sync-progress event fires', async () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-progress')).toBe(true);
      });

      const progressEvent: SyncProgressEvent = {
        hostId: 'host-123',
        status: 'fetching',
        entriesSynced: 75,
        totalEntries: 150,
        batchSize: 25,
        error: null,
      };

      act(() => {
        emitEvent('sync-progress', progressEvent);
      });

      expect(result.current.currentProgress).toEqual(progressEvent);
      expect(result.current.isSyncing).toBe(true);
    });

    it('clears sync progress when sync-completed event fires', async () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({
        currentSync: {
          hostId: 'host-123',
          status: 'fetching',
          entriesSynced: 100,
          totalEntries: 100,
          batchSize: 0,
          error: null,
        },
      });

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-completed')).toBe(true);
      });

      await act(async () => {
        emitEvent('sync-completed', { hostId: 'host-123', entriesSynced: 100, totalEntries: 100 });
      });

      expect(result.current.currentProgress).toBeNull();
      expect(result.current.isSyncing).toBe(false);
    });

    it('clears sync progress when sync-failed event fires', async () => {
      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({
        currentSync: {
          hostId: 'host-123',
          status: 'fetching',
          entriesSynced: 50,
          totalEntries: 100,
          batchSize: 50,
          error: null,
        },
      });

      const { result } = renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(mockListenCallbacks.has('sync-failed')).toBe(true);
      });

      await act(async () => {
        emitEvent('sync-failed', { hostId: 'host-123', error: 'Connection lost' });
      });

      expect(result.current.currentProgress).toBeNull();
      expect(result.current.isSyncing).toBe(false);
    });
  });

  describe('startSync', () => {
    it('triggers sync for current host', async () => {
      const mockTriggerSync = vi.fn().mockResolvedValue({
        hostId: 'host-123',
        success: true,
        entriesSynced: 50,
        totalEntries: 150,
        error: null,
        cancelled: false,
      });

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({
        triggerSync: mockTriggerSync,
      });

      const { result } = renderHook(() => useOfflineSync());

      await act(async () => {
        await result.current.startSync();
      });

      expect(mockTriggerSync).toHaveBeenCalledWith('host-123');
    });

    it('throws error when trying to sync local host', async () => {
      useConnectionStore.setState({
        connectedHostId: null,
        connectionStatus: 'disconnected',
      });

      const { result } = renderHook(() => useOfflineSync());

      await expect(result.current.startSync()).rejects.toThrow('Cannot sync local host');
    });
  });

  describe('stopSync', () => {
    it('cancels sync for current host', async () => {
      const mockCancelSync = vi.fn().mockResolvedValue(undefined);

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({
        cancelSync: mockCancelSync,
      });

      const { result } = renderHook(() => useOfflineSync());

      await act(async () => {
        await result.current.stopSync();
      });

      expect(mockCancelSync).toHaveBeenCalledWith('host-123');
    });

    it('cancels the active sync after switching hosts', async () => {
      const mockCancelSync = vi.fn().mockResolvedValue(undefined);

      useConnectionStore.setState({
        connectedHostId: 'host-123',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({
        currentSync: {
          hostId: 'other-host',
          status: 'fetching',
          entriesSynced: 50,
          totalEntries: 100,
          batchSize: 50,
          error: null,
        },
        cancelSync: mockCancelSync,
      });

      const { result } = renderHook(() => useOfflineSync());

      await act(async () => {
        await result.current.stopSync();
      });

      expect(mockCancelSync).toHaveBeenCalledWith('other-host');
    });
  });

  describe('singleton listener pattern', () => {
    it('only sets up listeners once across multiple hook instances', async () => {
      const { listen } = await import('@tauri-apps/api/event');

      renderHook(() => useOfflineSync());
      renderHook(() => useOfflineSync());
      renderHook(() => useOfflineSync());

      // Should only set up listeners once (3 event types)
      await waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(3);
      });
    });

    it('allows re-setup after cleanup', async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const { unmount } = renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(3);
      });

      unmount();
      vi.clearAllMocks();

      renderHook(() => useOfflineSync());

      await waitFor(() => {
        expect(listen).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('host switching', () => {
    it('updates syncState when switching hosts', () => {
      const syncState1: SyncState = {
        hostId: 'host-1',
        lastSyncTimestamp: 1000,
        lastCursor: null,
        syncStatus: 'completed',
        syncError: null,
        entriesSynced: 50,
      };
      const syncState2: SyncState = {
        hostId: 'host-2',
        lastSyncTimestamp: 2000,
        lastCursor: null,
        syncStatus: 'never',
        syncError: null,
        entriesSynced: 0,
      };
      const syncStates = new Map<string, SyncState>();
      syncStates.set('host-1', syncState1);
      syncStates.set('host-2', syncState2);

      useConnectionStore.setState({
        connectedHostId: 'host-1',
        connectionStatus: 'connected',
      });
      useOfflineStore.setState({ syncStates });

      const { result, rerender } = renderHook(() => useOfflineSync());

      expect(result.current.syncState).toEqual(syncState1);
      expect(result.current.lastSyncTime).toBe(1000);

      // Switch to host-2
      act(() => {
        useConnectionStore.setState({ connectedHostId: 'host-2' });
      });
      rerender();

      expect(result.current.syncState).toEqual(syncState2);
      expect(result.current.lastSyncTime).toBe(2000);
    });
  });
});
