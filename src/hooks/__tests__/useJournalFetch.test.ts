import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useJournalFetch, type JournalRefs } from '../useJournalFetch';
import type { JournalEntry, JournalFilter } from '../../lib/types';

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

function filter(overrides: Partial<JournalFilter> = {}): JournalFilter {
  return {
    units: [],
    excludedUnits: [],
    caseSensitive: false,
    limit: 500,
    reverse: true,
    ...overrides,
  };
}

function entry(cursor: string): JournalEntry {
  return {
    cursor,
    realtimeTimestamp: 1,
    bootId: 'boot',
    message: cursor,
    priority: 6,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function localRefs(): React.MutableRefObject<JournalRefs> {
  return {
    current: {
      filter: filter(),
      cursorEnd: null,
      dataSource: {
        hostId: 'local',
        isRemote: false,
        isConnected: false,
        isOffline: false,
      },
      enabled: true,
    },
  };
}

function actions() {
  return {
    setEntries: vi.fn(),
    appendEntries: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    setHasMore: vi.fn(),
    setCursorEnd: vi.fn(),
    setOfflineMode: vi.fn(),
  };
}

describe('useJournalFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits a current local page', async () => {
    const refs = localRefs();
    const state = actions();
    mockQueryJournal.mockResolvedValue({ entries: [entry('current')], hasMore: false, cursorEnd: 'current' });
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs());

    expect(state.setEntries).toHaveBeenCalledWith([entry('current')]);
    expect(state.setCursorEnd).toHaveBeenCalledWith('current');
    expect(state.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('keeps only B when B resolves before a stale A response', async () => {
    const refs = localRefs();
    const state = actions();
    const first = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    const second = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    mockQueryJournal.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    let firstRequest!: Promise<void>;
    await act(() => {
      firstRequest = result.current.fetchLogs();
    });
    refs.current = { ...refs.current, filter: filter({ grepPattern: 'B' }) };
    let secondRequest!: Promise<void>;
    await act(() => {
      secondRequest = result.current.fetchLogs();
    });
    await act(async () => {
      second.resolve({ entries: [entry('B')], hasMore: false, cursorEnd: 'B' });
      await secondRequest;
      first.resolve({ entries: [entry('A')], hasMore: false, cursorEnd: 'A' });
      await firstRequest;
    });

    expect(state.setEntries).toHaveBeenCalledTimes(1);
    expect(state.setEntries).toHaveBeenCalledWith([entry('B')]);
    expect(state.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('ignores a stale remote failure instead of changing offline mode', async () => {
    const refs = localRefs();
    refs.current.dataSource = {
      hostId: 'A',
      isRemote: true,
      isConnected: true,
      isOffline: false,
    };
    const state = actions();
    const request = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    mockQueryRemoteJournal.mockReturnValueOnce(request.promise);
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    let pending!: Promise<void>;
    await act(() => {
      pending = result.current.fetchLogs();
    });
    refs.current = {
      ...refs.current,
      dataSource: { ...refs.current.dataSource, hostId: 'B' },
    };
    await act(async () => {
      request.reject(new Error('SSH connection failed'));
      await pending;
    });

    expect(state.setOfflineMode).not.toHaveBeenCalled();
    expect(state.setError).toHaveBeenCalledTimes(1);
    expect(state.setError.mock.calls).toEqual([[null]]);
  });

  it('does not start duplicate appends', async () => {
    const refs = localRefs();
    refs.current.cursorEnd = 'cursor';
    const state = actions();
    state.setCursorEnd.mockImplementation((cursor: string | null) => {
      refs.current = { ...refs.current, cursorEnd: cursor };
    });
    const page = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    mockQueryJournal.mockReturnValueOnce(page.promise);
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    act(() => {
      void result.current.fetchLogs(true);
    });
    act(() => {
      void result.current.fetchLogs(true);
    });
    expect(mockQueryJournal).toHaveBeenCalledTimes(1);

    await act(async () => {
      page.resolve({ entries: [entry('next')], hasMore: false, cursorEnd: 'next' });
      await Promise.resolve();
    });
    expect(state.appendEntries).toHaveBeenCalledWith([entry('next')]);
    expect(state.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('retries the failed append with its original cursor and overrides', async () => {
    const refs = localRefs();
    refs.current.cursorEnd = 'page-one-end';
    const state = actions();
    mockQueryJournal
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockResolvedValueOnce({ entries: [entry('page-two')], hasMore: false, cursorEnd: 'page-two' });
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs(true, { since: 'sync-anchor' }));
    expect(result.current.canRetryFailedRequest).toBe(true);

    await act(async () => {
      result.current.retryFailedRequest();
      await Promise.resolve();
    });

    expect(mockQueryJournal).toHaveBeenNthCalledWith(1, {
      ...filter(),
      since: 'sync-anchor',
      afterCursor: 'page-one-end',
    });
    expect(mockQueryJournal).toHaveBeenNthCalledWith(2, {
      ...filter(),
      since: 'sync-anchor',
      afterCursor: 'page-one-end',
    });
    expect(state.appendEntries).toHaveBeenCalledTimes(1);
    expect(state.appendEntries).toHaveBeenCalledWith([entry('page-two')]);
  });

  it('does not retry an expired cached append cursor', async () => {
    const refs = localRefs();
    refs.current = {
      ...refs.current,
      cursorEnd: 'expired',
      dataSource: {
        hostId: 'cached-host',
        isRemote: true,
        isConnected: false,
        isOffline: true,
      },
    };
    const state = actions();
    mockQueryOfflineJournal.mockRejectedValueOnce(new Error('Cached page cursor expired; refresh logs.'));
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs(true));
    act(() => result.current.retryFailedRequest());

    expect(result.current.canRetryFailedRequest).toBe(false);
    expect(mockQueryOfflineJournal).toHaveBeenCalledOnce();
  });

  it('retries a failed page-one request instead of inferring an append from retained rows', async () => {
    const refs = localRefs();
    refs.current.cursorEnd = 'retained-page-end';
    const state = actions();
    mockQueryJournal
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce({ entries: [entry('replacement')], hasMore: false, cursorEnd: 'replacement' });
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs(false, { grepPattern: 'replacement' }));
    await act(async () => {
      result.current.retryFailedRequest();
      await Promise.resolve();
    });

    expect(mockQueryJournal).toHaveBeenNthCalledWith(1, {
      ...filter(),
      grepPattern: 'replacement',
    });
    expect(mockQueryJournal).toHaveBeenNthCalledWith(2, {
      ...filter(),
      grepPattern: 'replacement',
    });
    expect(state.setEntries).toHaveBeenCalledWith([entry('replacement')]);
  });

  it('does not start an imperative request while its controller is disabled', async () => {
    const refs = localRefs();
    refs.current.enabled = false;
    const state = actions();
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs());

    expect(mockQueryJournal).not.toHaveBeenCalled();
    expect(state.setLoading).not.toHaveBeenCalled();
  });

  it('binds every remote request to its requested host', async () => {
    const refs = localRefs();
    refs.current.dataSource = {
      hostId: 'host-a',
      isRemote: true,
      isConnected: true,
      isOffline: false,
    };
    const state = actions();
    mockQueryRemoteJournal.mockResolvedValue({ entries: [], hasMore: false });
    const { result } = renderHook(() => useJournalFetch({
      actions: state,
      refs,
      getCurrent: () => refs.current,
    }));

    await act(() => result.current.fetchLogs());
    expect(mockQueryRemoteJournal).toHaveBeenCalledWith('host-a', filter());
  });
});
