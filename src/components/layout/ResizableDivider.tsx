import { useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';

interface ResizableDividerProps {
  /** Orientation of the divider */
  orientation: 'vertical' | 'horizontal';
  /** Ratio currently displayed by the split view (0.0 to 1.0) */
  ratio: number;
  /** Stage a visual ratio change during a pointer interaction */
  onResize: (ratio: number) => void;
  /** Mark the start of a pointer interaction */
  onResizeStart?: () => void;
  /** Finish a successful resize, committing the supplied ratio */
  onResizeEnd: (ratio: number) => void;
  /** Cancel an in-progress resize without committing */
  onResizeCancel?: () => void;
  /** Minimum panel size as percentage (0.0 to 1.0) */
  minSize?: number;
}

export function ResizableDivider({
  orientation,
  ratio,
  onResize,
  onResizeStart,
  onResizeEnd,
  onResizeCancel,
  minSize = 0.2,
}: ResizableDividerProps) {
  const dividerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const hasDraggedRef = useRef(false);
  const containerRef = useRef<HTMLElement | null>(null);
  const captureOwnerRef = useRef<HTMLDivElement | null>(null);
  const latestRatioRef = useRef(ratio);
  const previousBodyStylesRef = useRef<{
    cursor: string;
    cursorPriority: string;
    userSelect: string;
    userSelectPriority: string;
  } | null>(null);

  const clampRatio = useCallback((nextRatio: number) => (
    Math.max(minSize, Math.min(1 - minSize, nextRatio))
  ), [minSize]);

  const restoreBodyStyles = useCallback(() => {
    const previousStyles = previousBodyStylesRef.current;
    if (!previousStyles) return;

    document.body.style.setProperty('cursor', previousStyles.cursor, previousStyles.cursorPriority);
    document.body.style.setProperty('user-select', previousStyles.userSelect, previousStyles.userSelectPriority);
    previousBodyStylesRef.current = null;
  }, []);

  const releasePointerCapture = useCallback((divider: HTMLDivElement, pointerId: number) => {
    if (divider.hasPointerCapture(pointerId)) {
      divider.releasePointerCapture(pointerId);
    }
  }, []);

  const cancelInteraction = useCallback((divider?: HTMLDivElement) => {
    if (!isDraggingRef.current) return;

    const pointerId = activePointerIdRef.current;
    const captureOwner = divider ?? captureOwnerRef.current;
    isDraggingRef.current = false;
    activePointerIdRef.current = null;
    hasDraggedRef.current = false;
    captureOwnerRef.current = null;
    containerRef.current = null;
    restoreBodyStyles();

    if (captureOwner && pointerId !== null) {
      releasePointerCapture(captureOwner, pointerId);
    }

    onResizeCancel?.();
  }, [onResizeCancel, releasePointerCapture, restoreBodyStyles]);

  const calculateRatio = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    if (orientation === 'vertical') {
      return rect.width === 0 ? null : clampRatio((clientX - rect.left) / rect.width);
    }

    return rect.height === 0 ? null : clampRatio((clientY - rect.top) / rect.height);
  }, [clampRatio, orientation]);
  useEffect(() => {
    if (!isDraggingRef.current) latestRatioRef.current = clampRatio(ratio);
  }, [clampRatio, ratio]);


  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isDraggingRef.current) return;

    event.preventDefault();
    const divider = event.currentTarget;
    isDraggingRef.current = true;
    activePointerIdRef.current = event.pointerId;
    hasDraggedRef.current = false;
    containerRef.current = divider.parentElement;
    captureOwnerRef.current = divider;
    previousBodyStylesRef.current = {
      cursor: document.body.style.getPropertyValue('cursor'),
      cursorPriority: document.body.style.getPropertyPriority('cursor'),
      userSelect: document.body.style.getPropertyValue('user-select'),
      userSelectPriority: document.body.style.getPropertyPriority('user-select'),
    };
    latestRatioRef.current = clampRatio(ratio);
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    divider.focus();
    divider.setPointerCapture(event.pointerId);
    onResizeStart?.();
  }, [clampRatio, onResizeStart, orientation, ratio]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || activePointerIdRef.current !== event.pointerId) return;

    const nextRatio = calculateRatio(event.clientX, event.clientY);
    if (nextRatio !== null && nextRatio !== latestRatioRef.current) {
      hasDraggedRef.current = true;
      latestRatioRef.current = nextRatio;
      onResize(nextRatio);
    }
  }, [calculateRatio, onResize]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || activePointerIdRef.current !== event.pointerId) return;

    const didDrag = hasDraggedRef.current;
    if (didDrag) {
      const nextRatio = calculateRatio(event.clientX, event.clientY);
      if (nextRatio !== null) {
        latestRatioRef.current = nextRatio;
        onResize(nextRatio);
      }
    }

    // Clear drag state before releasing capture: release dispatches
    // lostpointercapture in supporting browsers.
    isDraggingRef.current = false;
    hasDraggedRef.current = false;
    activePointerIdRef.current = null;
    captureOwnerRef.current = null;
    containerRef.current = null;
    restoreBodyStyles();
    releasePointerCapture(event.currentTarget, event.pointerId);
    if (didDrag) {
      onResizeEnd(latestRatioRef.current);
    } else {
      onResizeCancel?.();
    }
  }, [calculateRatio, onResize, onResizeCancel, onResizeEnd, releasePointerCapture, restoreBodyStyles]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    cancelInteraction(event.currentTarget);
  }, [cancelInteraction]);

  const handleLostPointerCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    cancelInteraction();
  }, [cancelInteraction]);

  const handleDoubleClick = useCallback(() => {
    onResizeEnd(0.5);
  }, [onResizeEnd]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && isDraggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      cancelInteraction(event.currentTarget);
      return;
    }

    let nextRatio: number | null = null;
    if (event.key === 'Home') {
      nextRatio = minSize;
    } else if (event.key === 'End') {
      nextRatio = 1 - minSize;
    } else if (orientation === 'vertical' && event.key === 'ArrowLeft') {
      nextRatio = ratio - 0.01;
    } else if (orientation === 'vertical' && event.key === 'ArrowRight') {
      nextRatio = ratio + 0.01;
    } else if (orientation === 'horizontal' && event.key === 'ArrowUp') {
      nextRatio = ratio - 0.01;
    } else if (orientation === 'horizontal' && event.key === 'ArrowDown') {
      nextRatio = ratio + 0.01;
    }

    if (nextRatio === null) return;

    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingRef.current) onResizeEnd(clampRatio(nextRatio));
  }, [cancelInteraction, clampRatio, minSize, onResizeEnd, orientation, ratio]);

  useEffect(() => () => {
    cancelInteraction(dividerRef.current ?? undefined);
  }, [cancelInteraction]);

  const isVertical = orientation === 'vertical';
  const value = Math.round(clampRatio(ratio) * 100);

  return (
    <div
      ref={dividerRef}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={clsx(
        'flex-shrink-0 bg-theme-secondary hover:bg-accent/30 transition-colors',
        'group relative',
        isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      )}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-valuemin={minSize * 100}
      aria-valuemax={(1 - minSize) * 100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
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
