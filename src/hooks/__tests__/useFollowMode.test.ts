import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useFollowMode } from '../useFollowMode';
import { useConnectionStore } from '../../stores/connectionStore';
import { useFilterStore } from '../../stores/filterStore';
import { useFollowModeStore } from '../../stores/followModeStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useOfflineStore } from '../../stores/offlineStore';
import type { JournalEntry, JournalFilter } from '../../lib/types';

vi.mock('../../lib/tauri', () => ({
  startFollow: vi.fn(), stopFollow: vi.fn(), startRemoteFollow: vi.fn(), stopRemoteFollow: vi.fn(), getHostPassword: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../../lib/errorLogger', () => ({ logError: vi.fn() }));

import { getHostPassword, startFollow, startRemoteFollow, stopFollow } from '../../lib/tauri';
import { listen } from '@tauri-apps/api/event';

const localStart = vi.mocked(startFollow);
const remoteStart = vi.mocked(startRemoteFollow);
const localStop = vi.mocked(stopFollow);
const password = vi.mocked(getHostPassword);
const mockListen = vi.mocked(listen);

const journalEntry = (cursor: string): JournalEntry => ({
  cursor,
  realtimeTimestamp: 1,
  bootId: 'test',
  message: cursor,
  priority: 6,
});

const filter = (overrides: Partial<JournalFilter> = {}): JournalFilter => ({ units: [], excludedUnits: [], priorities: [], caseSensitive: false, limit: 500, reverse: true, ...overrides });

function reset() {
  useFilterStore.setState({ filter: filter(), entries: [], isLoading: false, error: null, hasMore: false, cursorEnd: null, isFollowing: false, isFollowPaused: false });
  useConnectionStore.setState({ connectedHostId: null, connectionStatus: 'disconnected', activeTabId: 'local', openTabs: ['local'] });
  useOfflineStore.setState({ isOfflineMode: false });
  useLayoutStore.setState({ layout: 'single' });
  useFollowModeStore.getState().cleanup();
  useFollowModeStore.setState({ desiredSession: null });
}

describe('useFollowMode', () => {
  let handlers: Record<string, (event: { payload: unknown }) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    reset();
    handlers = {};
    mockListen.mockImplementation(async (name, handler) => {
      handlers[name] = (event) => handler({ event: name, id: 0, payload: event.payload });
      return () => {};
    });
    localStart.mockResolvedValue(undefined);
    remoteStart.mockResolvedValue(undefined);
    localStop.mockResolvedValue(undefined);
    password.mockResolvedValue(null);
  });

  afterEach(async () => {
    cleanup();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    vi.useRealTimers();
  });

  it('uses local follow for the Local tab even with an SSH connection', async () => {
    useConnectionStore.setState({ connectedHostId: 'host-a', connectionStatus: 'connected', activeTabId: 'local' });
    const { result } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    expect(localStart).toHaveBeenCalledWith(filter(), expect.any(String));
    expect(remoteStart).not.toHaveBeenCalled();
  });

  it('uses only the displayed connected remote host', async () => {
    useConnectionStore.setState({ connectedHostId: 'host-a', connectionStatus: 'connected', activeTabId: 'host-a' });
    const { result } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    expect(remoteStart).toHaveBeenCalledWith('host-a', filter(), expect.any(String), undefined);
  });

  it('ignores old-host and old-session events after a source transition', async () => {
    useConnectionStore.setState({ connectedHostId: 'host-a', connectionStatus: 'connected', activeTabId: 'host-a' });
    const { result, rerender } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    const first = useFollowModeStore.getState().desiredSession!;
    act(() => {
      useConnectionStore.setState({ connectedHostId: 'host-b', activeTabId: 'host-b' });
      rerender();
      handlers['journal-follow-entry']({ payload: { hostId: first.hostId, sessionId: first.sessionId, entries: [journalEntry('old')] } });
    });
    expect(useFilterStore.getState().entries).toEqual([]);
  });

  it('refreshes shared listener callbacks for a replacement session', async () => {
    const { result } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    await act(async () => { await result.current.start(); });
    const replacement = useFollowModeStore.getState().desiredSession!;

    act(() => {
      handlers['journal-follow-entry']({
        payload: {
          hostId: replacement.hostId,
          sessionId: replacement.sessionId,
          entries: [journalEntry('replacement')],
        },
      });
    });
    expect(useFilterStore.getState().entries).toEqual([journalEntry('replacement')]);

    act(() => {
      handlers['journal-follow-stopped']({
        payload: {
          hostId: replacement.hostId,
          sessionId: replacement.sessionId,
        },
      });
    });
    expect(useFollowModeStore.getState().desiredSession).toBeNull();
  });

  it('retains a worker error while historical loading resumes', async () => {
    const { result } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    const session = useFollowModeStore.getState().desiredSession!;

    act(() => {
      handlers['journal-follow-error']({
        payload: {
          hostId: session.hostId,
          sessionId: session.sessionId,
          message: 'journalctl exited with status 1',
        },
      });
    });

    expect(useFollowModeStore.getState().desiredSession).toBeNull();
    expect(useFollowModeStore.getState().startupError).toBe(
      'Follow mode error: journalctl exited with status 1',
    );
  });

  it('sets desiredSession before the start IPC awaits', async () => {
    let resolveStart!: () => void;
    localStart.mockReturnValue(new Promise<void>((resolve) => { resolveStart = resolve; }));
    const { result } = renderHook(useFollowMode);
    act(() => { void result.current.start(); });
    expect(useFollowModeStore.getState().desiredSession).toMatchObject({ hostId: 'local' });
    await act(async () => {
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    await act(async () => { resolveStart(); });
  });

  it('does not revive a session stopped while its start was pending', async () => {
    let resolveStart!: () => void;
    localStart.mockReturnValue(new Promise<void>((resolve) => { resolveStart = resolve; }));
    const { result } = renderHook(useFollowMode);
    act(() => { void result.current.start(); });
    await act(async () => {
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    const session = useFollowModeStore.getState().desiredSession!;
    act(() => { void result.current.stop(); });
    await act(async () => { resolveStart(); await Promise.resolve(); });
    expect(localStop).toHaveBeenCalledWith(session.sessionId);
    expect(useFilterStore.getState().isFollowing).toBe(false);
  });

  it('restarts with the latest debounced filter', async () => {
    const { result } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    act(() => {
      useFilterStore.getState().setFilter({ units: ['first.service'] });
      useFilterStore.getState().setFilter({ units: ['latest.service'] });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(localStart).toHaveBeenLastCalledWith(expect.objectContaining({ units: ['latest.service'] }), expect.any(String));
  });

  it('keeps a pending restart after an equivalent filter write', async () => {
    const { result, rerender } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    const startsBeforeRestart = localStart.mock.calls.length;

    act(() => {
      useFilterStore.getState().setFilter({ units: ['errors.service'] });
      rerender();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => {
      useFilterStore.getState().setFilter({ units: ['errors.service'] });
      rerender();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(localStart).toHaveBeenCalledTimes(startsBeforeRestart + 1);
    expect(localStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ units: ['errors.service'] }),
      expect.any(String),
    );
  });

  it('cancels a queued filter restart after switching to split layout', async () => {
    let resolveStop!: () => void;
    localStop.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStop = resolve; }));
    const { result, rerender } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    const initialSessionId = useFollowModeStore.getState().desiredSession!.sessionId;
    localStop.mockClear();
    await act(async () => {
      useFilterStore.getState().setFilter({ units: ['restart.service'] });
      rerender();
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(localStop.mock.calls.filter(([sessionId]) => sessionId === initialSessionId)).toHaveLength(1);

    act(() => {
      useLayoutStore.setState({ layout: 'split-vertical' });
      rerender();
    });
    await act(async () => {
      resolveStop();
      await Promise.resolve();
    });

    expect(localStart).toHaveBeenCalledTimes(1);
  });

  it('cancels a queued filter restart when the follow owner unmounts', async () => {
    let resolveStop!: () => void;
    localStop.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveStop = resolve; }));
    const { result, rerender, unmount } = renderHook(useFollowMode);
    await act(async () => { await result.current.start(); });
    localStop.mockClear();
    const initialSessionId = useFollowModeStore.getState().desiredSession!.sessionId;
    await act(async () => {
      useFilterStore.getState().setFilter({ units: ['restart.service'] });
      rerender();
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(localStop.mock.calls.filter(([sessionId]) => sessionId === initialSessionId)).toHaveLength(1);

    unmount();
    await act(async () => {
      resolveStop();
      await Promise.resolve();
    });

    expect(localStart).toHaveBeenCalledTimes(1);
  });
});
