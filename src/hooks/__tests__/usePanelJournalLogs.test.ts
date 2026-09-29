import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePanelJournalLogs } from '../usePanelJournalLogs';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFilterStore } from '../../stores/filterStore';
import { useFollowModeStore } from '../../stores/followModeStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useSplitPanelStore } from '../../stores/splitPanelStore';
import { DEBOUNCE_MS } from '../../lib/constants';
import type { JournalEntry, JournalFilter } from '../../lib/types';

vi.mock('../../lib/tauri', () => ({
  queryJournal: vi.fn(),
  queryRemoteJournal: vi.fn(),
}));
vi.mock('../../lib/offlineTauri', () => ({
  queryOfflineJournal: vi.fn(),
}));

import { queryRemoteJournal } from '../../lib/tauri';

const mockQueryRemoteJournal = vi.mocked(queryRemoteJournal);

function filter(): JournalFilter {
  return {
    units: [],
    excludedUnits: [],
    caseSensitive: false,
    limit: 500,
    reverse: true,
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const emptyPanel = {
  entries: [],
  resultGeneration: 0,
  isLoading: false,
  error: null,
  hasMore: false,
  cursorEnd: null,
};

describe('usePanelJournalLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFilterStore.setState({ filter: filter(), isFollowing: false });
    useConnectionStore.setState({
      activeTabId: 'host-a',
      connectedHostId: 'host-a',
      connectionStatus: 'connected',
    });
    useOfflineStore.setState({ isOfflineMode: false });
    useFollowModeStore.setState({ desiredSession: null });
    useLayoutStore.setState({
      layout: 'split-vertical',
      leftPanelHostId: 'host-a',
      rightPanelHostId: 'local',
    });
    useSplitPanelStore.setState({
      leftPanel: { ...emptyPanel },
      rightPanel: { ...emptyPanel },
      refreshTrigger: 0,
    });
  });

  it('rejects a left-panel result after its store assignment changes', async () => {
    const request = deferred<{ entries: JournalEntry[]; hasMore: boolean; cursorEnd: string }>();
    mockQueryRemoteJournal.mockReturnValueOnce(request.promise);
    const { unmount } = renderHook(() => usePanelJournalLogs({ hostId: 'host-a', panelPosition: 'left' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockQueryRemoteJournal).toHaveBeenCalledWith('host-a', filter());

    await act(async () => {
      useLayoutStore.getState().setLeftPanelHost('host-b');
      request.resolve({ entries: [entry('from-a')], hasMore: false, cursorEnd: 'from-a' });
      await Promise.resolve();
    });

    expect(useSplitPanelStore.getState().leftPanel.entries).toEqual([]);
    expect(useSplitPanelStore.getState().leftPanel.cursorEnd).toBeNull();
    unmount();
  });

  it('cancels paused filter debounce before re-enabling the panel', async () => {
    vi.useFakeTimers();
    mockQueryRemoteJournal.mockResolvedValue({ entries: [], hasMore: false });
    const { rerender, unmount } = renderHook(() =>
      usePanelJournalLogs({ hostId: 'host-a', panelPosition: 'left' })
    );
    await act(async () => {
      await Promise.resolve();
    });
    mockQueryRemoteJournal.mockClear();

    useFollowModeStore.setState({ desiredSession: { hostId: 'host-a', sessionId: 'live' } });
    rerender();
    useFilterStore.getState().setFilter({ grepPattern: 'changed while paused' });
    rerender();
    useFollowModeStore.setState({ desiredSession: null });
    rerender();
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(DEBOUNCE_MS);
      await Promise.resolve();
    });

    expect(mockQueryRemoteJournal).toHaveBeenCalledTimes(1);
    unmount();
    vi.useRealTimers();
  });
});
