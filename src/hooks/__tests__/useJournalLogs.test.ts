import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useJournalLogs } from '../useJournalLogs';
import { useFilterStore } from '../../stores/filterStore';
import { LOCAL_TAB_ID, useConnectionStore } from '../../stores/connectionStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useScrollSyncStore } from '../../stores/scrollSyncStore';
import { useFollowModeStore } from '../../stores/followModeStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { SCROLL_SYNC_OFFSET_MS, DEBOUNCE_MS } from '../../lib/constants';
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

function testFilter(overrides: Partial<JournalFilter> = {}): JournalFilter {
  return {
    units: [],
    excludedUnits: [],
    caseSensitive: false,
    limit: 500,
    reverse: true,
    ...overrides,
  };
}

function result(cursor = 'cursor') {
  return { entries: [], hasMore: false, cursorEnd: cursor };
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('useJournalLogs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useFilterStore.setState({
      filter: testFilter(),
      entries: [],
      isLoading: false,
      error: null,
      hasMore: false,
      cursorEnd: null,
      isFollowing: false,
      isFollowPaused: false,
    });
    useConnectionStore.setState({
      activeTabId: LOCAL_TAB_ID,
      connectedHostId: null,
      connectionStatus: 'disconnected',
    });
    useOfflineStore.setState({ isOfflineMode: false });
    useScrollSyncStore.setState({ syncEnabled: false, anchorTimestamp: null });
    useFollowModeStore.setState({ desiredSession: null, startupError: null });
    useLayoutStore.setState({ layout: 'single', leftPanelHostId: null, rightPanelHostId: null });
    mockQueryJournal.mockResolvedValue(result());
    mockQueryRemoteJournal.mockResolvedValue(result());
    mockQueryOfflineJournal.mockResolvedValue(result());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads page one immediately and exposes only controls', async () => {
    const { result: hook } = renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockQueryJournal).toHaveBeenCalledWith(testFilter());
    expect(Object.keys(hook.current).sort()).toEqual(['canRetry', 'loadMore', 'refresh', 'retry']);
  });

  it('loads again when re-enabled with unchanged filters', async () => {
    const { rerender } = renderHook(({ enabled }) => useJournalLogs(enabled), {
      initialProps: { enabled: false },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockQueryJournal).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockQueryJournal).toHaveBeenCalledTimes(1);
  });

  it('inhibits historical requests while a live session is desired', async () => {
    useFollowModeStore.setState({ desiredSession: { hostId: 'local', sessionId: 'starting' } });
    renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockQueryJournal).not.toHaveBeenCalled();
  });

  it('does not commit a pending page after a live session becomes desired', async () => {
    const pending = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    mockQueryJournal.mockReturnValueOnce(pending.promise);
    renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      useFollowModeStore.setState({ desiredSession: { hostId: 'local', sessionId: 'starting' } });
      pending.resolve({ entries: [entry('late-page')], hasMore: false, cursorEnd: 'late-page' });
      await Promise.resolve();
    });

    expect(useFilterStore.getState().entries).toEqual([]);
    expect(useFilterStore.getState().cursorEnd).not.toBe('late-page');
  });

  it('rejects an imperative refresh once a live session is desired', async () => {
    const { result: hook } = renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryJournal.mockClear();
    useFollowModeStore.setState({ desiredSession: { hostId: 'local', sessionId: 'starting' } });

    await act(async () => {
      hook.current.refresh();
      await Promise.resolve();
    });

    expect(mockQueryJournal).not.toHaveBeenCalled();
  });

  it('rejects an imperative refresh once the main view switches to split mode', async () => {
    const { result: hook } = renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryJournal.mockClear();

    useLayoutStore.setState({ layout: 'split-vertical' });
    await act(async () => {
      hook.current.refresh();
      await Promise.resolve();
    });

    expect(mockQueryJournal).not.toHaveBeenCalled();
  });

  it('uses the exact scroll-sync timestamp override on a tab replacement', async () => {
    const anchorTimestamp = 1_700_000_000_123_000;
    useConnectionStore.setState({
      activeTabId: 'host-a',
      connectedHostId: 'host-a',
      connectionStatus: 'connected',
    });
    useScrollSyncStore.setState({ syncEnabled: true, anchorTimestamp });
    const { rerender } = renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryRemoteJournal.mockClear();

    useConnectionStore.setState({
      activeTabId: 'host-b',
      connectedHostId: 'host-b',
      connectionStatus: 'connected',
    });
    rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockQueryRemoteJournal).toHaveBeenCalledWith(
      'host-b',
      expect.objectContaining({
        since: new Date(anchorTimestamp / 1000 - SCROLL_SYNC_OFFSET_MS).toISOString(),
      }),
    );
  });

  it('does not defer a tab-sync override past a later filter edit while disabled', async () => {
    const anchorTimestamp = 1_700_000_000_123_000;
    useConnectionStore.setState({
      activeTabId: 'host-a',
      connectedHostId: 'host-a',
      connectionStatus: 'connected',
    });
    useScrollSyncStore.setState({ syncEnabled: true, anchorTimestamp });
    const { rerender } = renderHook(({ enabled }) => useJournalLogs(enabled), {
      initialProps: { enabled: true },
    });
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryRemoteJournal.mockClear();

    rerender({ enabled: false });
    useConnectionStore.setState({
      activeTabId: 'host-b',
      connectedHostId: 'host-b',
      connectionStatus: 'connected',
    });
    rerender({ enabled: false });
    await act(async () => {
      useFilterStore.getState().setFilter({ grepPattern: 'edited after tab switch' });
      await Promise.resolve();
    });

    rerender({ enabled: true });
    await act(async () => {
      await Promise.resolve();
    });

    const [, requestedFilter] = mockQueryRemoteJournal.mock.lastCall!;
    expect(requestedFilter).toMatchObject({ grepPattern: 'edited after tab switch' });
    expect(requestedFilter.since).toBeUndefined();
  });

  it('preserves a follow startup error while historical loading resumes', async () => {
    useFollowModeStore.setState({
      desiredSession: { hostId: LOCAL_TAB_ID, sessionId: 'starting' },
      startupError: null,
    });
    renderHook(() => useJournalLogs());
    expect(mockQueryJournal).not.toHaveBeenCalled();

    await act(async () => {
      useFollowModeStore.setState({
        desiredSession: null,
        startupError: 'Failed to start follow mode: keyring unavailable',
      });
      await Promise.resolve();
    });

    expect(mockQueryJournal).toHaveBeenCalled();
    expect(useFilterStore.getState().error).toBe('Failed to start follow mode: keyring unavailable');
    expect(useFollowModeStore.getState().startupError).toBeNull();
  });

  it('switches current remote failures to persisted offline mode, then reloads cached page one', async () => {
    useConnectionStore.setState({
      activeTabId: 'host-a',
      connectedHostId: 'host-a',
      connectionStatus: 'connected',
    });
    mockQueryRemoteJournal.mockRejectedValueOnce(new Error('SSH connection failed'));
    renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useOfflineStore.getState().isOfflineMode).toBe(true);
    expect(mockQueryOfflineJournal).toHaveBeenCalledWith('host-a', testFilter());
  });

  it('debounces subsequent filter changes and cancels them on source replacement', async () => {
    const { rerender } = renderHook(() => useJournalLogs());
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryJournal.mockClear();

    useFilterStore.getState().setFilter({ grepPattern: 'later' });
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(mockQueryJournal).not.toHaveBeenCalled();

    useConnectionStore.setState({ activeTabId: 'another-local' });
    rerender();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });
    expect(mockQueryJournal).not.toHaveBeenCalled();
    expect(mockQueryOfflineJournal).toHaveBeenCalled();
  });
});
