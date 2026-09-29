import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from '../LogViewer';
import { useFilterStore } from '../../../stores/filterStore';
import { LOCAL_TAB_ID, useConnectionStore } from '../../../stores/connectionStore';
import { useOfflineStore } from '../../../stores/offlineStore';
import { useScrollSyncStore } from '../../../stores/scrollSyncStore';
import type { JournalEntry } from '../../../lib/types';

const virtualizerSyncPositions = vi.hoisted(() => ({
  positions: [] as number[],
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    measurementsCache: Array.from({ length: count }, (_, index) => ({
      index,
      key: getItemKey(index),
      start: index * 41,
      size: 41,
      end: (index + 1) * 41,
      lane: 0,
    })),
    getTotalSize: () => count * 41,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: getItemKey(index),
      start: index * 41,
      size: 41,
    })),
    measureElement: () => undefined,
    getOffsetForIndex: (index: number) => [Math.min(index * 41, 4000), 'start'] as const,
    scrollToIndex: () => {
      const dispatchSyncScroll = (step: number) => {
        requestAnimationFrame(() => {
          const element = document.querySelector('[aria-label="Log entries"]') as HTMLElement | null;
          const position = virtualizerSyncPositions.positions[step];
          if (element && position !== undefined) {
            element.scrollTop = position;
          }
          element?.dispatchEvent(new Event('scroll', { bubbles: true }));
          if (step + 1 < Math.max(virtualizerSyncPositions.positions.length, 1)) {
            dispatchSyncScroll(step + 1);
          }
        });
      };
      dispatchSyncScroll(0);
    },
  }),
}));

vi.mock('../LogEntry', () => ({
  LogEntryRow: ({ entry, isExpanded, onToggleExpand }: {
    entry: JournalEntry;
    isExpanded: boolean;
    onToggleExpand: (cursor: string) => void;
  }) => (
    <button onClick={() => onToggleExpand(entry.cursor)}>
      {entry.message}
      {isExpanded && <span>{`details-${entry.cursor}`}</span>}
    </button>
  ),
}));

vi.mock('../LogExport', () => ({
  LogExport: () => null,
}));

let keyboardToggleExpand: ((index: number) => void) | undefined;

vi.mock('../../../hooks/useKeyboardNavigation', () => ({
  useKeyboardNavigation: (options: { onToggleExpand: (index: number) => void }) => {
    keyboardToggleExpand = options.onToggleExpand;
  },
}));

const row = (cursor: string): JournalEntry => ({
  cursor,
  realtimeTimestamp: 1,
  bootId: 'boot',
  message: cursor,
  priority: 6,
});

const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

function runFrameBatch() {
  const callbacks = [...frameCallbacks.entries()];
  frameCallbacks.clear();
  callbacks.forEach(([, callback]) => callback(0));
}

function runFrames() {
  while (frameCallbacks.size > 0) {
    const callbacks = [...frameCallbacks.entries()];
    frameCallbacks.clear();
    callbacks.forEach(([, callback]) => callback(0));
  }
}

describe('LogViewer', () => {
  beforeEach(() => {
    nextFrame = 1;
    frameCallbacks.clear();
    keyboardToggleExpand = undefined;
    virtualizerSyncPositions.positions = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frameCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frameCallbacks.delete(id);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    useFilterStore.setState({
      filter: { units: [], excludedUnits: [], caseSensitive: false, limit: 500, reverse: true },
      entries: [],
      isLoading: false,
      error: null,
      hasMore: true,
      cursorEnd: 'cursor',
      isFollowing: false,
      isFollowPaused: false,
    });
    useConnectionStore.setState({
      activeTabId: LOCAL_TAB_ID,
      connectedHostId: null,
      connectionStatus: 'disconnected',
    });
    useOfflineStore.setState({ isOfflineMode: false });
    useScrollSyncStore.setState({
      syncEnabled: false,
      anchorTimestamp: null,
      sourceTabId: null,
      syncVersion: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderViewer(canRetry = true) {
    const onRefresh = vi.fn();
    const onLoadMore = vi.fn();
    const onRetry = vi.fn();
    const onPauseFollow = vi.fn();
    const onResumeFollow = vi.fn();
    render(
      <LogViewer
        onRefresh={onRefresh}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
        canRetry={canRetry}
        onPauseFollow={onPauseFollow}
        onResumeFollow={onResumeFollow}
      />,
    );
    return { onRefresh, onLoadMore, onRetry, onPauseFollow, onResumeFollow };
  }

  it('keeps expanded details through appended and prepended rows, then clears them for the next page-one result', () => {
    useFilterStore.getState().setEntries([row('one')]);
    renderViewer();

    fireEvent.click(screen.getByRole('button', { name: /one/ }));
    expect(screen.getByText('details-one')).toBeInTheDocument();

    act(() => {
      useFilterStore.getState().appendEntries([row('two')]);
      useFilterStore.getState().prependEntries([row('three')]);
    });
    expect(screen.getByText('details-one')).toBeInTheDocument();

    act(() => {
      useFilterStore.getState().setEntries([row('one')]);
    });
    expect(screen.queryByText('details-one')).not.toBeInTheDocument();
  });

  it('routes retained-row Retry through the failed request callback rather than load more', () => {
    useFilterStore.getState().setEntries([row('retained')]);
    useFilterStore.getState().setError('network interrupted');
    const { onLoadMore, onRefresh, onRetry } = renderViewer();

    expect(screen.getByRole('button', { name: /retained/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('offers only Refresh logs when an expired cached append cursor cannot be retried', () => {
    useFilterStore.getState().setEntries([row('retained')]);
    useFilterStore.getState().setError('Cached page cursor expired; refresh logs.');
    const { onRefresh, onRetry } = renderViewer(false);

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));

    expect(onRetry).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('pins live batches without smooth scrolling and only smooth-scrolls on explicit resume', () => {
    useFilterStore.setState({
      entries: [row('initial')],
      isFollowing: true,
      isFollowPaused: false,
    });
    const { onResumeFollow } = renderViewer();
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);

    act(() => {
      useFilterStore.getState().prependEntries([row('live')]);
    });
    act(() => {
      runFrames();
    });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }));

    scrollTo.mockClear();
    act(() => {
      useFilterStore.getState().setFollowPaused(true);
      useFilterStore.getState().prependEntries([row('paused-live')]);
    });
    act(() => {
      runFrames();
    });
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume following' }));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(onResumeFollow).toHaveBeenCalledOnce();
  });

  it('pauses Follow for mouse and keyboard expansion after Follow starts', () => {
    useFilterStore.getState().setEntries([row('expandable')]);
    const { onPauseFollow } = renderViewer();

    act(() => {
      useFilterStore.getState().setFollowing(true);
    });
    fireEvent.click(screen.getByRole('button', { name: /expandable/ }));
    act(() => {
      keyboardToggleExpand?.(0);
    });

    expect(onPauseFollow).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued automatic live scroll when expansion pauses Follow', () => {
    useFilterStore.setState({
      entries: [row('initial')],
      isFollowing: true,
      isFollowPaused: false,
    });
    const { onPauseFollow } = renderViewer();
    const scrollTo = vi.mocked(HTMLElement.prototype.scrollTo);

    act(() => {
      useFilterStore.getState().prependEntries([row('live')]);
    });
    fireEvent.click(screen.getByRole('button', { name: /live/ }));
    act(() => {
      runFrames();
    });

    expect(onPauseFollow).toHaveBeenCalledOnce();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps a paused anchor near the end using its unclamped row start', () => {
    const initialRows = Array.from({ length: 10 }, (_, index) => row(`anchor-${index}`));
    useFilterStore.setState({
      entries: initialRows,
      isFollowing: true,
      isFollowPaused: true,
    });
    renderViewer();
    const list = screen.getByRole('listbox');
    const anchor = list.querySelector('[data-cursor="anchor-8"]') as HTMLElement;
    Object.defineProperty(list, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 0, 400, 200),
    });
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 30, 400, 41),
    });
    fireEvent.click(screen.getByRole('button', { name: /anchor-8/ }));

    act(() => {
      useFilterStore.getState().prependEntries(
        Array.from({ length: 100 }, (_, index) => row(`live-${index}`)),
      );
    });

    expect(list.scrollTop).toBe((108 * 41) - 30);
  });

  it('suppresses the deferred scroll event emitted by a synchronized position change', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    useFilterStore.getState().setEntries([row('sync-target')]);
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-tab',
      syncVersion: 1,
      broadcastTimestamp,
    });
    renderViewer();

    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });

    expect(broadcastTimestamp).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not echo multi-frame synchronization and accepts the first subsequent user scroll', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    virtualizerSyncPositions.positions = [12, 24, 24];
    useFilterStore.getState().setEntries([row('sync-target')]);
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-tab',
      syncVersion: 1,
      broadcastTimestamp,
    });
    renderViewer();

    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });
    expect(broadcastTimestamp).not.toHaveBeenCalled();

    act(() => {
      fireEvent.scroll(screen.getByRole('listbox'));
      runFrames();
      vi.advanceTimersByTime(151);
    });
    expect(broadcastTimestamp).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('broadcasts the next user scroll after cancelling a no-op synchronized scroll', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    useFilterStore.getState().setEntries([row('sync-target')]);
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-tab',
      syncVersion: 1,
      broadcastTimestamp,
    });
    renderViewer();

    act(() => {
      useFilterStore.getState().setEntries([row('sync-target')]);
    });
    fireEvent.scroll(screen.getByRole('listbox'));
    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });

    expect(broadcastTimestamp).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('preserves an undelivered sync event through repeated expansion cancellation', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    virtualizerSyncPositions.positions = [12];
    useFilterStore.getState().setEntries([row('sync-target')]);
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-tab',
      syncVersion: 1,
      broadcastTimestamp,
    });
    renderViewer();
    const list = screen.getByRole('listbox');

    list.scrollTop = 12;
    fireEvent.click(screen.getByRole('button', { name: /sync-target/ }));
    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });
    expect(broadcastTimestamp).not.toHaveBeenCalled();

    fireEvent.scroll(list);
    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });
    expect(broadcastTimestamp).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('does not suppress a user scroll when a delivered moved sync is cancelled', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    virtualizerSyncPositions.positions = [12];
    useFilterStore.getState().setEntries([row('sync-target')]);
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-tab',
      syncVersion: 1,
      broadcastTimestamp,
    });
    renderViewer();

    act(() => runFrameBatch());
    act(() => {
      useFilterStore.getState().setEntries([row('sync-target')]);
    });
    fireEvent.scroll(screen.getByRole('listbox'));
    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });

    expect(broadcastTimestamp).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

});
