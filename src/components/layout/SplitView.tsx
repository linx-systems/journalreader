import { useCallback } from 'react';
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
    resetSplitRatio,
    swapPanels,
    exitSplitView,
  } = useLayoutStore();

  const { activeTabId } = useConnectionStore();

  // Use props or fall back to store values
  const layout = layoutProp ?? storeLayout;
  const leftHostId = leftHostIdProp ?? leftPanelHostId ?? activeTabId;
  const rightHostId = rightHostIdProp ?? rightPanelHostId ?? LOCAL_TAB_ID;

  const isVerticalSplit = layout === 'split-vertical';
  const isHorizontalSplit = layout === 'split-horizontal';
  const isSplit = isVerticalSplit || isHorizontalSplit;

  const handleResize = useCallback((ratio: number) => {
    setSplitRatio(ratio);
  }, [setSplitRatio]);

  const handleResetRatio = useCallback(() => {
    resetSplitRatio();
  }, [resetSplitRatio]);

  const handleCollapse = useCallback(() => {
    exitSplitView();
  }, [exitSplitView]);

  if (!isSplit) {
    // Single view mode - render nothing (App.tsx handles this)
    return null;
  }

  // Calculate panel sizes based on ratio
  const leftSize = `${splitRatio * 100}%`;
  const rightSize = `${(1 - splitRatio) * 100}%`;

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
        onResize={handleResize}
        onDoubleClick={handleResetRatio}
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
