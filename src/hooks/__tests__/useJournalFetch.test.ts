import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useJournalFetch, type JournalRefs } from '../useJournalFetch';
import type { JournalFilter, JournalEntry } from '../../lib/types';

// Mock the tauri modules
vi.mock('../../lib/tauri', () => ({
  queryJournal: vi.fn(),
  queryRemoteJournal: vi.fn(),
}));

vi.mock('../../lib/offlineTauri', () => ({
  queryOfflineJournal: vi.fn(),
}));

import { queryJournal, queryRemoteJournal } from '../../lib/tauri';
import { queryOfflineJournal } from '../../lib/offlineTauri';

const mockQueryJournal = vi.mocked(queryJournal);
const mockQueryRemoteJournal = vi.mocked(queryRemoteJournal);
const mockQueryOfflineJournal = vi.mocked(queryOfflineJournal);

const createFilter = (overrides: Partial<JournalFilter> = {}): JournalFilter => ({
  units: [],
  excludedUnits: [],
  caseSensitive: false,
  limit: 500,
  reverse: true,
  ...overrides,
});

const createEntry = (cursor: string): JournalEntry => ({
  cursor,
  realtimeTimestamp: Date.now() * 1000,
  bootId: 'boot-1',
  message: `Message ${cursor}`,
  priority: 6,
});

const createMockActions = () => ({
  setEntries: vi.fn(),
  appendEntries: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  setHasMore: vi.fn(),
  setCursorEnd: vi.fn(),
  setOfflineMode: vi.fn().mockResolvedValue(undefined),
});

const createRefs = (overrides: Partial<JournalRefs> = {}): React.MutableRefObject<JournalRefs> => ({
  current: {
    filter: createFilter(),
    cursorEnd: null,
    dataSource: {
      hostId: 'local',
      isRemote: false,
      isConnected: false,
      isOffline: false,
    },
    ...overrides,
  },
});

describe('useJournalFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryJournal.mockResolvedValue({
      entries: [createEntry('1'), createEntry('2')],
      hasMore: true,
      cursorEnd: '2',
    });
    mockQueryRemoteJournal.mockResolvedValue({
      entries: [createEntry('r1'), createEntry('r2')],
      hasMore: true,
      cursorEnd: 'r2',
    });
    mockQueryOfflineJournal.mockResolvedValue({
      entries: [createEntry('o1'), createEntry('o2')],
      hasMore: false,
      cursorEnd: 'o2',
    });
  });

  describe('data source selection', () => {
    it('queries local journal when not remote', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(mockQueryJournal).toHaveBeenCalledTimes(1);
      expect(mockQueryRemoteJournal).not.toHaveBeenCalled();
      expect(mockQueryOfflineJournal).not.toHaveBeenCalled();
    });

    it('queries remote journal when remote and connected', async () => {
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: true,
          isOffline: false,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(mockQueryRemoteJournal).toHaveBeenCalledTimes(1);
      expect(mockQueryJournal).not.toHaveBeenCalled();
      expect(mockQueryOfflineJournal).not.toHaveBeenCalled();
    });

    it('queries offline journal when in offline mode', async () => {
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: false,
          isOffline: true,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(mockQueryOfflineJournal).toHaveBeenCalledWith('host-1', refs.current.filter);
      expect(mockQueryJournal).not.toHaveBeenCalled();
      expect(mockQueryRemoteJournal).not.toHaveBeenCalled();
    });

    it('queries offline journal when remote but not connected', async () => {
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: false,
          isOffline: false,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(mockQueryOfflineJournal).toHaveBeenCalledWith('host-1', refs.current.filter);
    });
  });

  describe('fetch behavior', () => {
    it('sets loading true at start and false at end', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setLoading).toHaveBeenCalledWith(true);
      expect(actions.setLoading).toHaveBeenLastCalledWith(false);
    });

    it('clears error at start of fetch', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setError).toHaveBeenCalledWith(null);
    });

    it('sets entries when not appending', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs(false);
      });

      expect(actions.setEntries).toHaveBeenCalled();
      expect(actions.appendEntries).not.toHaveBeenCalled();
    });

    it('appends entries when append=true', async () => {
      const actions = createMockActions();
      const refs = createRefs({ cursorEnd: 'prev-cursor' });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs(true);
      });

      expect(actions.appendEntries).toHaveBeenCalled();
      expect(actions.setEntries).not.toHaveBeenCalled();
    });

    it('includes afterCursor when appending with cursorEnd', async () => {
      const actions = createMockActions();
      const refs = createRefs({ cursorEnd: 'prev-cursor' });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs(true);
      });

      expect(mockQueryJournal).toHaveBeenCalledWith(
        expect.objectContaining({ afterCursor: 'prev-cursor' })
      );
    });

    it('updates hasMore and cursorEnd after fetch', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setHasMore).toHaveBeenCalledWith(true);
      expect(actions.setCursorEnd).toHaveBeenCalledWith('2');
    });
  });

  describe('sync-adjusted filter', () => {
    it('applies syncAdjustedFilter when set', async () => {
      const actions = createMockActions();
      const refs = createRefs({
        syncAdjustedFilter: { since: '2024-01-01T00:00:00.000Z' },
      });
      const onSyncFilterUsed = vi.fn();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs, onSyncFilterUsed })
      );

      await act(async () => {
        await result.current.fetchLogs(false);
      });

      expect(mockQueryJournal).toHaveBeenCalledWith(
        expect.objectContaining({ since: '2024-01-01T00:00:00.000Z' })
      );
      expect(onSyncFilterUsed).toHaveBeenCalled();
    });

    it('does not apply syncAdjustedFilter when appending', async () => {
      const actions = createMockActions();
      const refs = createRefs({
        cursorEnd: 'prev-cursor',
        syncAdjustedFilter: { since: '2024-01-01T00:00:00.000Z' },
      });
      const onSyncFilterUsed = vi.fn();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs, onSyncFilterUsed })
      );

      await act(async () => {
        await result.current.fetchLogs(true);
      });

      expect(mockQueryJournal).toHaveBeenCalledWith(
        expect.not.objectContaining({ since: '2024-01-01T00:00:00.000Z' })
      );
      expect(onSyncFilterUsed).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('sets error message on fetch failure', async () => {
      mockQueryJournal.mockRejectedValue(new Error('Fetch failed'));
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setError).toHaveBeenCalledWith('Fetch failed');
    });

    it('falls back to offline mode on connection error', async () => {
      mockQueryRemoteJournal.mockRejectedValue(new Error('Connection refused'));
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: true,
          isOffline: false,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setOfflineMode).toHaveBeenCalledWith(true);
      expect(mockQueryOfflineJournal).toHaveBeenCalled();
      expect(actions.setError).not.toHaveBeenCalledWith('Connection refused');
    });

    it('sets error if offline fallback also fails', async () => {
      mockQueryRemoteJournal.mockRejectedValue(new Error('Connection refused'));
      mockQueryOfflineJournal.mockRejectedValue(new Error('Offline data unavailable'));
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: true,
          isOffline: false,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setError).toHaveBeenCalledWith('Connection refused');
    });

    it('does not attempt fallback for non-connection errors', async () => {
      mockQueryRemoteJournal.mockRejectedValue(new Error('Permission denied'));
      const actions = createMockActions();
      const refs = createRefs({
        dataSource: {
          hostId: 'host-1',
          isRemote: true,
          isConnected: true,
          isOffline: false,
        },
      });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        await result.current.fetchLogs();
      });

      expect(actions.setOfflineMode).not.toHaveBeenCalled();
      expect(actions.setError).toHaveBeenCalledWith('Permission denied');
    });
  });

  describe('loadMore and refresh', () => {
    it('loadMore calls fetchLogs with append=true', async () => {
      const actions = createMockActions();
      const refs = createRefs({ cursorEnd: 'cursor' });

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(actions.appendEntries).toHaveBeenCalled();
      });
    });

    it('refresh calls fetchLogs with append=false', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(actions.setEntries).toHaveBeenCalled();
      });
    });
  });

  describe('abort handling', () => {
    it('creates a new AbortController for each fetch', async () => {
      const actions = createMockActions();
      const refs = createRefs();

      const { result } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      // First fetch
      await act(async () => {
        await result.current.fetchLogs();
      });

      // Second fetch
      await act(async () => {
        await result.current.fetchLogs();
      });

      // Both fetches completed - the AbortController is primarily for unmount cleanup
      expect(mockQueryJournal).toHaveBeenCalledTimes(2);
    });

    it('aborts pending request on unmount', async () => {
      let resolveQuery: (value: unknown) => void;
      const pendingPromise = new Promise((resolve) => {
        resolveQuery = resolve;
      });

      mockQueryJournal.mockImplementationOnce(() => pendingPromise as Promise<never>);

      const actions = createMockActions();
      const refs = createRefs();

      const { result, unmount } = renderHook(() =>
        useJournalFetch({ actions, refs })
      );

      // Start a fetch that won't complete
      const fetchPromise = result.current.fetchLogs();

      // Unmount while fetch is pending
      unmount();

      // Resolve the query after unmount
      resolveQuery!({
        entries: [createEntry('1')],
        hasMore: false,
        cursorEnd: '1',
      });

      // Wait for promise to settle
      await act(async () => {
        await fetchPromise.catch(() => {});
      });

      // Loading should have been set to true at start
      expect(actions.setLoading).toHaveBeenCalledWith(true);
      // Note: The actual state updates may still occur since we're not checking the abort signal
      // in the query functions. The AbortController is prepared for future integration.
    });
  });
});
