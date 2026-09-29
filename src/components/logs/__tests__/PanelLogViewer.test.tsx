import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelLogViewer } from '../PanelLogViewer';
import { usePanelJournalLogs } from '../../../hooks/usePanelJournalLogs';
import { useFilterStore } from '../../../stores/filterStore';
import { useConnectionStore } from '../../../stores/connectionStore';
import { useOfflineStore } from '../../../stores/offlineStore';
import { useScrollSyncStore } from '../../../stores/scrollSyncStore';
import { useSplitPanelStore } from '../../../stores/splitPanelStore';
import type { JournalEntry } from '../../../lib/types';

const virtualizerSyncPositions = vi.hoisted(() => ({
  positions: [] as number[],
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (index: number) => string | number }) => ({
    getTotalSize: () => count * 48,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: getItemKey(index),
      start: index * 48,
      size: 48,
    })),
    measureElement: () => undefined,
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

vi.mock('../../../hooks/usePanelJournalLogs', () => ({
  usePanelJournalLogs: vi.fn(),
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

vi.mock('../../../hooks/useKeyboardNavigation', () => ({
  useKeyboardNavigation: () => undefined,
}));

const mockUsePanelJournalLogs = vi.mocked(usePanelJournalLogs);
const row: JournalEntry = {
  cursor: 'retained',
  realtimeTimestamp: 1,
  bootId: 'boot',
  message: 'retained',
  priority: 6,
};

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

describe('PanelLogViewer', () => {
  beforeEach(() => {
    nextFrame = 1;
    frameCallbacks.clear();
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
    });
    useConnectionStore.setState({ connectedHostId: null, connectionStatus: 'disconnected' });
    useOfflineStore.setState({ isOfflineMode: false });
    useScrollSyncStore.setState({ syncEnabled: false, anchorTimestamp: null, sourceTabId: null, syncVersion: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('keeps loaded panel rows visible after append errors with page retry and refresh recovery', () => {
    const loadMore = vi.fn();
    const refresh = vi.fn();
    const retry = vi.fn();
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: 'network interrupted',
      hasMore: true,
      loadMore,
      refresh,
      retry,
      canRetry: true,
    });

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

    expect(screen.getByText('retained')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));

    expect(retry).toHaveBeenCalledOnce();
    expect(loadMore).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('offers Refresh logs without Retry for an expired cached page cursor', () => {
    const refresh = vi.fn();
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: 'Cached page cursor expired; refresh logs.',
      hasMore: true,
      loadMore: vi.fn(),
      refresh,
      retry: vi.fn(),
      canRetry: false,
    });

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));
    expect(refresh).toHaveBeenCalledOnce();
  });


  it('keeps expanded details through panel pagination and clears them for the next page-one result', () => {
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      retry: vi.fn(),
      canRetry: false,
    });
    useSplitPanelStore.getState().setLeftEntries([row]);

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);
    fireEvent.click(screen.getByRole('button', { name: /retained/ }));
    expect(screen.getByText('details-retained')).toBeInTheDocument();

    act(() => {
      useSplitPanelStore.getState().appendLeftEntries([{ ...row, cursor: 'appended' }]);
      useSplitPanelStore.getState().prependLeftEntries([{ ...row, cursor: 'prepended' }]);
    });
    expect(screen.getByText('details-retained')).toBeInTheDocument();

    act(() => {
      useSplitPanelStore.getState().setLeftEntries([row]);
    });
    expect(screen.queryByText('details-retained')).not.toBeInTheDocument();
  });
  it('suppresses the deferred scroll event emitted by a synchronized panel position change', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      retry: vi.fn(),
      canRetry: false,
    });
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-host',
      syncVersion: 1,
      broadcastTimestamp,
    });

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });

    expect(broadcastTimestamp).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('broadcasts the next panel scroll after cancelling a no-op synchronized scroll', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      retry: vi.fn(),
      canRetry: false,
    });
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-host',
      syncVersion: 1,
      broadcastTimestamp,
    });

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

    act(() => {
      useSplitPanelStore.getState().setLeftEntries([row]);
    });
    fireEvent.scroll(screen.getByRole('listbox'));
    act(() => {
      runFrames();
      vi.advanceTimersByTime(151);
    });

    expect(broadcastTimestamp).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('does not echo multi-frame panel synchronization and accepts the first subsequent user scroll', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    virtualizerSyncPositions.positions = [12, 24, 24];
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      retry: vi.fn(),
      canRetry: false,
    });
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-host',
      syncVersion: 1,
      broadcastTimestamp,
    });

    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

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
  it('does not suppress a panel user scroll when a delivered moved sync is cancelled', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const broadcastTimestamp = vi.fn();
    virtualizerSyncPositions.positions = [12];
    mockUsePanelJournalLogs.mockReturnValue({
      entries: [row],
      isLoading: false,
      error: null,
      hasMore: false,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      retry: vi.fn(),
      canRetry: false,
    });
    useScrollSyncStore.setState({
      syncEnabled: true,
      anchorTimestamp: 1,
      sourceTabId: 'another-host',
      syncVersion: 1,
      broadcastTimestamp,
    });
    render(<PanelLogViewer hostId="host-a" panelPosition="left" />);

    act(() => runFrameBatch());
    act(() => {
      useSplitPanelStore.getState().setLeftEntries([row]);
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
