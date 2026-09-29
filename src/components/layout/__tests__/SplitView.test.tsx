import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SplitView } from '../SplitView';
import { useConnectionStore, LOCAL_TAB_ID } from '../../../stores/connectionStore';
import { useLayoutStore } from '../../../stores/layoutStore';

vi.mock('../SplitPanel', () => ({
  SplitPanel: ({ position }: { position: string }) => <div data-panel={position} />,
}));

const frameCallbacks = new Map<number, FrameRequestCallback>();
const originalSetSplitRatio = useLayoutStore.getState().setSplitRatio;
let nextFrame = 1;
let capturedPointerId: number | null = null;
let setSplitRatioSpy = vi.fn(originalSetSplitRatio);

function flushFrames() {
  const callbacks = [...frameCallbacks.values()];
  frameCallbacks.clear();
  callbacks.forEach((callback) => callback(0));
}

function setSplitLayout(layout: 'split-vertical' | 'split-horizontal' = 'split-vertical', ratio = 0.5) {
  setSplitRatioSpy = vi.fn(originalSetSplitRatio);
  useLayoutStore.setState({
    layout,
    splitRatio: ratio,
    leftPanelHostId: LOCAL_TAB_ID,
    rightPanelHostId: LOCAL_TAB_ID,
    minPanelSize: 0.2,
    setSplitRatio: setSplitRatioSpy,
  });
  useConnectionStore.setState({ activeTabId: LOCAL_TAB_ID });
}

function renderSplitView(layout: 'split-vertical' | 'split-horizontal' = 'split-vertical', ratio = 0.5) {
  setSplitLayout(layout, ratio);
  const result = render(<SplitView />);
  const separator = screen.getByRole('separator', { name: 'Resize panels' });
  const container = separator.parentElement;
  if (!container) throw new Error('Split view container is missing');
  Object.defineProperty(container, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(0, 0, 100, 100),
  });
  return { ...result, separator };
}

describe('SplitView resizing', () => {
  beforeEach(() => {
    nextFrame = 1;
    capturedPointerId = null;
    frameCallbacks.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrame++;
      frameCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frameCallbacks.delete(id);
    });
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn((pointerId: number) => {
        capturedPointerId = pointerId;
      }),
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: (pointerId: number) => capturedPointerId === pointerId,
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn((pointerId: number) => {
        if (capturedPointerId === pointerId) capturedPointerId = null;
      }),
    });
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('coalesces pointer moves to one frame without committing until pointerup', () => {
    const { separator } = renderSplitView();
    const persistWriteSpy = vi.spyOn(Storage.prototype, 'setItem');
    const leftPanel = separator.previousElementSibling as HTMLElement;

    fireEvent.pointerDown(separator, { pointerId: 99, button: 2, clientX: 50, clientY: 50 });
    expect(capturedPointerId).toBeNull();

    fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    expect(capturedPointerId).toBe(1);
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 30, clientY: 50 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 40, clientY: 50 });

    expect(setSplitRatioSpy).not.toHaveBeenCalled();
    expect(persistWriteSpy).not.toHaveBeenCalled();
    expect(frameCallbacks.size).toBe(1);

    act(() => flushFrames());
    expect(leftPanel.style.width).toBe('40%');
    expect(setSplitRatioSpy).not.toHaveBeenCalled();
    expect(persistWriteSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 60, clientY: 50 });
    expect(leftPanel.style.width).toBe('60%');
    expect(setSplitRatioSpy).toHaveBeenCalledTimes(1);
    expect(setSplitRatioSpy).toHaveBeenLastCalledWith(0.6);
    expect(persistWriteSpy).toHaveBeenCalledTimes(1);

    fireEvent.lostPointerCapture(separator, { pointerId: 1 });
    expect(useLayoutStore.getState().splitRatio).toBe(0.6);
    expect(setSplitRatioSpy).toHaveBeenCalledTimes(1);
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape', 'unmount'] as const)(
    'restores the starting ratio and body styles on %s without committing',
    (cancellation) => {
      const { separator, unmount } = renderSplitView();
      const leftPanel = separator.previousElementSibling as HTMLElement;
      document.body.style.setProperty('cursor', 'wait', 'important');
      document.body.style.setProperty('user-select', 'text', 'important');

      fireEvent.pointerDown(separator, { pointerId: 4, button: 0, clientX: 50, clientY: 50 });
      fireEvent.pointerMove(separator, { pointerId: 4, clientX: 70, clientY: 50 });
      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');

      if (cancellation === 'pointercancel') {
        fireEvent.pointerCancel(separator, { pointerId: 4 });
      } else if (cancellation === 'lostpointercapture') {
        fireEvent.lostPointerCapture(separator, { pointerId: 4 });
      } else if (cancellation === 'Escape') {
        fireEvent.keyDown(separator, { key: 'Escape' });
      } else {
        unmount();
      }

      expect(frameCallbacks.size).toBe(0);
      expect(setSplitRatioSpy).not.toHaveBeenCalled();
      expect(capturedPointerId).toBeNull();
      expect(document.body.style.cursor).toBe('wait');
      expect(document.body.style.userSelect).toBe('text');
      if (cancellation !== 'unmount') expect(leftPanel.style.width).toBe('50%');
    },
  );

  it('exposes vertical keyboard separator semantics and commits clamped changes without bubbling', () => {
    const { separator } = renderSplitView();
    const globalKeyListener = vi.fn();
    document.addEventListener('keydown', globalKeyListener);

    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuemin', '20');
    expect(separator).toHaveAttribute('aria-valuemax', '80');
    expect(separator).toHaveAttribute('aria-valuenow', '50');
    expect(separator).toHaveAttribute('aria-valuetext', '50%');

    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(useLayoutStore.getState().splitRatio).toBe(0.51);
    expect(separator).toHaveAttribute('aria-valuenow', '51');
    expect(globalKeyListener).not.toHaveBeenCalled();

    fireEvent.keyDown(separator, { key: 'Home' });
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(useLayoutStore.getState().splitRatio).toBe(0.2);

    fireEvent.keyDown(separator, { key: 'End' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(useLayoutStore.getState().splitRatio).toBe(0.8);
    expect(setSplitRatioSpy).toHaveBeenCalledTimes(5);
    document.removeEventListener('keydown', globalKeyListener);
  });

  it('uses Up and Down only for horizontal separators', () => {
    const { separator } = renderSplitView('split-horizontal');

    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(setSplitRatioSpy).not.toHaveBeenCalled();

    fireEvent.keyDown(separator, { key: 'ArrowDown' });
    expect(useLayoutStore.getState().splitRatio).toBe(0.51);
    expect(setSplitRatioSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(separator, { key: 'ArrowUp' });
    expect(useLayoutStore.getState().splitRatio).toBe(0.5);
  });

  it('resets to 50 percent with one commit after the pointer sequence of a double-click', () => {
    const { separator } = renderSplitView('split-vertical', 0.7);

    fireEvent.pointerDown(separator, { pointerId: 7, button: 0, clientX: 70, clientY: 50 });
    fireEvent.pointerUp(separator, { pointerId: 7, clientX: 70, clientY: 50 });
    fireEvent.pointerDown(separator, { pointerId: 8, button: 0, clientX: 70, clientY: 50 });
    fireEvent.pointerUp(separator, { pointerId: 8, clientX: 70, clientY: 50 });

    expect(useLayoutStore.getState().splitRatio).toBe(0.7);
    expect(setSplitRatioSpy).not.toHaveBeenCalled();

    fireEvent.doubleClick(separator);

    expect(useLayoutStore.getState().splitRatio).toBe(0.5);
    expect(setSplitRatioSpy).toHaveBeenCalledTimes(1);
    expect(setSplitRatioSpy).toHaveBeenCalledWith(0.5);
  });

  it('uses external committed ratio changes when no pointer interaction is active', () => {
    const { separator } = renderSplitView();
    const leftPanel = separator.previousElementSibling as HTMLElement;

    act(() => originalSetSplitRatio(0.7));

    expect(leftPanel.style.width).toBe('70%');
    expect(separator).toHaveAttribute('aria-valuenow', '70');
  });
});
