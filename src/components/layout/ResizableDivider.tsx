import { useCallback, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface ResizableDividerProps {
  /** Orientation of the divider */
  orientation: 'vertical' | 'horizontal';
  /** Callback when resize occurs with new ratio (0.0 to 1.0) */
  onResize: (ratio: number) => void;
  /** Callback when resize ends */
  onResizeEnd?: () => void;
  /** Double-click to reset to 50/50 */
  onDoubleClick?: () => void;
  /** Minimum panel size as percentage (0.0 to 1.0) */
  minSize?: number;
}

export function ResizableDivider({
  orientation,
  onResize,
  onResizeEnd,
  onDoubleClick,
  minSize = 0.2,
}: ResizableDividerProps) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    // Get the parent container for calculating ratios
    containerRef.current = dividerRef.current?.parentElement || null;

    // Add global mouse event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [orientation]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    let ratio: number;
    if (orientation === 'vertical') {
      // Horizontal split (left/right panels)
      ratio = (e.clientX - rect.left) / rect.width;
    } else {
      // Vertical split (top/bottom panels)
      ratio = (e.clientY - rect.top) / rect.height;
    }

    // Clamp to min/max
    ratio = Math.max(minSize, Math.min(1 - minSize, ratio));
    onResize(ratio);
  }, [orientation, minSize, onResize]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    containerRef.current = null;

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    onResizeEnd?.();
  }, [handleMouseMove, onResizeEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.();
  }, [onDoubleClick]);

  const isVertical = orientation === 'vertical';

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className={clsx(
        'flex-shrink-0 bg-theme-secondary hover:bg-accent/30 transition-colors',
        'group relative',
        isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      )}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label="Resize panels"
      title="Drag to resize. Double-click to reset."
    >
      {/* Visual indicator on hover */}
      <div
        className={clsx(
          'absolute bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity',
          isVertical
            ? 'left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-1 h-8 rounded'
            : 'top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 h-1 w-8 rounded'
        )}
      />
    </div>
  );
}
