import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePanelJournalLogs, type PanelPosition } from '../../hooks/usePanelJournalLogs';
import { useFilterStore } from '../../stores/filterStore';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { LogEntryRow } from './LogEntry';
import { LogExport, type LogExportResult } from './LogExport';
import { Loader2, AlertCircle, FileSearch } from 'lucide-react';

interface ViewerState {
  prevEntriesLength: number;
  isScrolling: boolean;
  anchor: { cursor: string; offset: number } | null;
  lastExpandedCursor: string | null;
}

interface PanelLogViewerProps {
  /** The host ID to display logs for */
  hostId: string;
  /** Which panel position this is (for state management) */
  panelPosition: PanelPosition;
}

/**
 * LogViewer component specifically for split panels.
 * Uses the panel-specific journal logs hook to maintain independent state
 * per panel, allowing proper display when swapping sides.
 */
export function PanelLogViewer({ hostId, panelPosition }: PanelLogViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { entries, isLoading, error, hasMore, loadMore } = usePanelJournalLogs({
    hostId,
    panelPosition,
  });
  const { filter } = useFilterStore();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exportNotification, setExportNotification] = useState<LogExportResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleExportComplete = useCallback((result: LogExportResult) => {
    setExportNotification(result);
    setTimeout(() => setExportNotification(null), 3000);
  }, []);

  // Consolidated state ref for scroll/anchor management
  const viewerState = useRef<ViewerState>({
    prevEntriesLength: entries.length,
    isScrolling: false,
    anchor: null,
    lastExpandedCursor: null,
  });

  // Keep entries ref for getItemKey
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const getItemKey = useCallback((index: number) => {
    return entriesRef.current[index]?.cursor ?? index;
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    getItemKey,
    estimateSize: () => 48,
    overscan: 10,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 48,
  });

  // Handle keyboard navigation toggle expand by index
  const handleKeyboardToggleExpand = useCallback((index: number) => {
    const entry = entries[index];
    if (entry) {
      const cursor = entry.cursor;
      if (parentRef.current) {
        const parent = parentRef.current;
        const anchorEl = parent.querySelector(`[data-cursor="${cursor}"]`);
        if (anchorEl) {
          const parentRect = parent.getBoundingClientRect();
          const anchorRect = anchorEl.getBoundingClientRect();
          viewerState.current.anchor = {
            cursor,
            offset: anchorRect.top - parentRect.top,
          };
        }
      }
      setExpandedRows((prev) => {
        const next = new Set(prev);
        if (next.has(cursor)) {
          next.delete(cursor);
        } else {
          next.add(cursor);
          viewerState.current.lastExpandedCursor = cursor;
        }
        return next;
      });
    }
  }, [entries]);

  // Keyboard navigation for log list
  useKeyboardNavigation({
    itemCount: entries.length,
    selectedIndex,
    onSelectionChange: setSelectedIndex,
    onToggleExpand: handleKeyboardToggleExpand,
    virtualizer: rowVirtualizer,
    enabled: !isLoading && entries.length > 0,
  });

  // Clear selection when entries change (filter change)
  useEffect(() => {
    setSelectedIndex(null);
  }, [filter]);

  const handleToggleExpand = useCallback((cursor: string) => {
    if (parentRef.current) {
      const parent = parentRef.current;
      const anchorEl = parent.querySelector(`[data-cursor="${cursor}"]`);
      if (anchorEl) {
        const parentRect = parent.getBoundingClientRect();
        const anchorRect = anchorEl.getBoundingClientRect();
        viewerState.current.anchor = {
          cursor,
          offset: anchorRect.top - parentRect.top,
        };
      }
    }

    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(cursor)) {
        next.delete(cursor);
      } else {
        next.add(cursor);
        viewerState.current.lastExpandedCursor = cursor;
      }
      return next;
    });
  }, []);

  const handleScroll = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scrollHandler = () => {
      // No-op for now - simplified panel viewer doesn't need complex scroll logic
    };

    return () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        timeoutId = null;
        scrollHandler();
      }, 16);
    };
  }, []);

  // Clear expanded rows when hostId changes
  useEffect(() => {
    setExpandedRows(new Set());
    setSelectedIndex(null);
  }, [hostId]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--color-priority-error)' }} />
          <h3 className="text-lg font-medium text-theme mb-2">
            Error loading logs
          </h3>
          <p className="text-sm text-theme-secondary max-w-md">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!isLoading && entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <FileSearch className="h-12 w-12 text-theme-secondary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-theme mb-2">
            No logs found
          </h3>
          <p className="text-sm text-theme-secondary">
            Try adjusting your filters or time range
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-theme-secondary border-b border-theme text-xs font-medium text-theme-secondary">
        <div className="w-6"></div>
        <div className="w-28">Time</div>
        <div className="w-16 text-center">Level</div>
        <div className="w-48">Unit</div>
        <div className="flex-1">Message</div>
        <LogExport
          entries={entries}
          filter={filter}
          onExportComplete={handleExportComplete}
        />
      </div>

      {/* Export notification */}
      {exportNotification && (
        <div
          className={`px-3 py-2 text-sm ${
            exportNotification.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {exportNotification.message}
        </div>
      )}

      {/* Virtualized list */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
        role="listbox"
        aria-label="Log entries"
        aria-activedescendant={selectedIndex !== null ? `log-entry-${panelPosition}-${selectedIndex}` : undefined}
        tabIndex={0}
      >
        {entries.length > 0 && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
            role="presentation"
          >
            {rowVirtualizer
              .getVirtualItems()
              .filter((virtualRow) => {
                if (!entries || virtualRow.index >= entries.length) return false;
                return !!entries[virtualRow.index];
              })
              .map((virtualRow) => {
                const entry = entries[virtualRow.index]!;
                const isExpanded = expandedRows.has(entry.cursor);
                const isSelected = selectedIndex === virtualRow.index;
                return (
                  <div
                    key={entry.cursor}
                    id={`log-entry-${panelPosition}-${virtualRow.index}`}
                    data-index={virtualRow.index}
                    data-cursor={entry.cursor}
                    ref={rowVirtualizer.measureElement}
                    role="option"
                    aria-selected={isSelected}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <LogEntryRow
                      entry={entry}
                      searchPattern={filter.grepPattern}
                      isExpanded={isExpanded}
                      isSelected={isSelected}
                      onToggleExpand={handleToggleExpand}
                    />
                  </div>
                );
              })}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 accent-theme animate-spin" />
            <span className="ml-2 text-sm text-theme-secondary">Loading logs...</span>
          </div>
        )}

        {/* Load more indicator */}
        {hasMore && !isLoading && (
          <div className="flex items-center justify-center py-4">
            <button
              onClick={loadMore}
              className="text-sm accent-theme hover:opacity-80"
            >
              Load more...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
