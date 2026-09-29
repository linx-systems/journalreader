import { useCallback, useEffect, useRef, useState } from 'react';
import { SplitPanel } from './SplitPanel';
import { ResizableDivider } from './ResizableDivider';
import { useLayoutStore, type ViewLayout } from '../../stores/layoutStore';
import { useConnectionStore, LOCAL_TAB_ID } from '../../stores/connectionStore';
import clsx from 'clsx';

interface SplitViewProps {
  /** Override the layout (if not using store) */
  layout?: ViewLayout;
  /** Override the left/top panel host ID */
  leftHostId?: string;
  /** Override the right/bottom panel host ID */
  rightHostId?: string;
}

export function SplitView({
  layout: layoutProp,
  leftHostId: leftHostIdProp,
  rightHostId: rightHostIdProp,
}: SplitViewProps) {
  const {
    layout: storeLayout,
    splitRatio,
    leftPanelHostId,
    rightPanelHostId,
    minPanelSize,
    setSplitRatio,
    swapPanels,
    exitSplitView,
  } = useLayoutStore();

  const [displayRatio, setDisplayRatio] = useState(splitRatio);
  const isDraggingRef = useRef(false);
  const dragStartRatioRef = useRef(splitRatio);
  const pendingRatioRef = useRef(splitRatio);
  const resizeFrameRef = useRef<number | null>(null);

  const { activeTabId } = useConnectionStore();

  // Use props or fall back to store values
  const layout = layoutProp ?? storeLayout;
  const leftHostId = leftHostIdProp ?? leftPanelHostId ?? activeTabId;
  const rightHostId = rightHostIdProp ?? rightPanelHostId ?? LOCAL_TAB_ID;

  const isVerticalSplit = layout === 'split-vertical';
  const isHorizontalSplit = layout === 'split-horizontal';
  const isSplit = isVerticalSplit || isHorizontalSplit;

  const cancelPendingResize = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
  }, []);

  const handleResizeStart = useCallback(() => {
    const committedRatio = useLayoutStore.getState().splitRatio;
    isDraggingRef.current = true;
    dragStartRatioRef.current = committedRatio;
    pendingRatioRef.current = committedRatio;
  }, []);

  const handleResize = useCallback((ratio: number) => {
    pendingRatioRef.current = ratio;
    if (resizeFrameRef.current !== null) return;

    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      setDisplayRatio(pendingRatioRef.current);
    });
  }, []);

  const handleResizeEnd = useCallback((ratio: number) => {
    cancelPendingResize();
    pendingRatioRef.current = ratio;
    isDraggingRef.current = false;
    setDisplayRatio(ratio);
    setSplitRatio(ratio);
  }, [cancelPendingResize, setSplitRatio]);

  const handleResizeCancel = useCallback(() => {
    cancelPendingResize();
    pendingRatioRef.current = dragStartRatioRef.current;
    isDraggingRef.current = false;
    setDisplayRatio(dragStartRatioRef.current);
  }, [cancelPendingResize]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      pendingRatioRef.current = splitRatio;
      setDisplayRatio(splitRatio);
    }
  }, [splitRatio]);

  useEffect(() => () => {
    cancelPendingResize();
  }, [cancelPendingResize]);

  const handleCollapse = useCallback(() => {
    exitSplitView();
  }, [exitSplitView]);

  if (!isSplit) {
    // Single view mode - render nothing (App.tsx handles this)
    return null;
  }

  // Calculate panel sizes based on the local display ratio while dragging.
  const leftSize = `${displayRatio * 100}%`;
  const rightSize = `${(1 - displayRatio) * 100}%`;

  return (
    <div
      className={clsx(
        'flex flex-1 min-h-0 min-w-0 overflow-hidden',
        isVerticalSplit ? 'flex-row' : 'flex-col'
      )}
    >
      {/* Left/Top panel */}
      <div
        className="min-h-0 min-w-0 flex"
        style={{
          [isVerticalSplit ? 'width' : 'height']: leftSize,
          flexShrink: 0,
        }}
      >
        <SplitPanel
          hostId={leftHostId}
          position={isVerticalSplit ? 'left' : 'top'}
          canCollapse
          onCollapse={handleCollapse}
          onSwap={swapPanels}
        />
      </div>

      {/* Resizable divider */}
      <ResizableDivider
        orientation={isVerticalSplit ? 'vertical' : 'horizontal'}
        ratio={displayRatio}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
        onResizeCancel={handleResizeCancel}
        minSize={minPanelSize}
      />

      {/* Right/Bottom panel */}
      <div
        className="min-h-0 min-w-0 flex flex-1"
        style={{
          [isVerticalSplit ? 'width' : 'height']: rightSize,
        }}
      >
        <SplitPanel
          hostId={rightHostId}
          position={isVerticalSplit ? 'right' : 'bottom'}
          canCollapse
          onCollapse={handleCollapse}
          onSwap={swapPanels}
        />
      </div>
    </div>
  );
}
