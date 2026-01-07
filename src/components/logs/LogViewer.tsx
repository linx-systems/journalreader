import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFollowMode } from '../../hooks/useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { LogEntryRow } from './LogEntry';
import { LogExport, type LogExportResult } from './LogExport';
import { Loader2, AlertCircle, FileSearch, ArrowDown } from 'lucide-react';

// Consolidated viewer state to reduce ref fragmentation
interface ViewerState {
  prevEntriesLength: number;
  isScrolling: boolean;
  anchor: { cursor: string; offset: number } | null;
  lastExpandedCursor: string | null;
}

export function LogViewer() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { entries, isLoading, error, hasMore, loadMore } = useJournalLogs();
  const { filter, isFollowing, isFollowPaused } = useFilterStore();
  const { pause, resume } = useFollowMode();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const [exportNotification, setExportNotification] = useState<LogExportResult | null>(null);

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

  // Keep entries ref for getItemKey (needs current entries without causing re-render)
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

  const updateAnchor = useCallback((preferredCursor?: string) => {
    if (!parentRef.current) return;
    const parent = parentRef.current;
    const preferred = preferredCursor ?? viewerState.current.anchor?.cursor;
    let cursor = preferred;
    let anchorEl: HTMLElement | null = null;

    if (cursor) {
      anchorEl = parent.querySelector(`[data-cursor="${cursor}"]`);
    }

    if (!anchorEl) {
      const virtualItems = rowVirtualizer.getVirtualItems();
      if (virtualItems.length === 0) return;
      const scrollTop = parent.scrollTop;
      const visibleItem =
        virtualItems.find((item) => item.start <= scrollTop && item.start + item.size > scrollTop) ??
        virtualItems[0];
      cursor = entries[visibleItem.index]?.cursor ?? null;
      if (!cursor) return;
      anchorEl = parent.querySelector(`[data-cursor="${cursor}"]`);
    }

    if (!anchorEl || !cursor) return;
    const parentRect = parent.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    viewerState.current.anchor = {
      cursor,
      offset: anchorRect.top - parentRect.top,
    };
  }, [entries, rowVirtualizer]);

  // Store these in refs so handleToggleExpand can access current values without re-creating
  const isFollowingRef = useRef(isFollowing);
  const userScrolledRef = useRef(userScrolled);
  isFollowingRef.current = isFollowing;
  userScrolledRef.current = userScrolled;

  const handleToggleExpand = useCallback((cursor: string) => {
    // Inline anchor update to avoid dependency on updateAnchor
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
      if (isFollowingRef.current) {
        if (next.size > 0) {
          pause();
        } else if (!userScrolledRef.current) {
          resume();
          viewerState.current.lastExpandedCursor = null;
        }
      }
      return next;
    });
  }, [pause, resume]);

  // Scroll to top (where newest entries appear in follow mode)
  const scrollToTop = useCallback(() => {
    if (!parentRef.current) return;
    viewerState.current.isScrolling = true;
    parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      viewerState.current.isScrolling = false;
    }, 500);
  }, []);

  // Store scroll handler deps in refs to avoid recreating debounced function
  const scrollDepsRef = useRef({
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
    userScrolled,
  });
  scrollDepsRef.current = {
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
    userScrolled,
  };

  const handleScroll = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scrollHandler = () => {
      if (!parentRef.current) return;

      const { scrollTop } = parentRef.current;
      const { isFollowing, isFollowPaused, expandedRowsSize, userScrolled } = scrollDepsRef.current;

      // Handle follow mode scroll behavior
      if (isFollowing && !viewerState.current.isScrolling) {
        const atTop = scrollTop < 50;

        if (!atTop && !userScrolled) {
          // User scrolled away from top - pause follow mode
          setUserScrolled(true);
          pause();
        } else if (atTop && userScrolled) {
          // User scrolled back to top - resume follow mode
          setUserScrolled(false);
          resume();
        }
      }

      // No automatic load more on scroll - user clicks the button instead
      // This prevents scroll position issues and infinite loading loops

      if (isFollowing && (isFollowPaused || expandedRowsSize > 0)) {
        updateAnchor(viewerState.current.lastExpandedCursor ?? undefined);
      } else if (!isFollowing || (!isFollowPaused && expandedRowsSize === 0)) {
        viewerState.current.anchor = null;
      }
    };

    // Debounced wrapper (~60fps)
    return () => {
      if (timeoutId) return; // Skip if already scheduled
      timeoutId = setTimeout(() => {
        timeoutId = null;
        scrollHandler();
      }, 16);
    };
  }, [pause, resume, updateAnchor]);

  // Handle new entries in follow mode - scroll to top or maintain anchor position
  useEffect(() => {
    const prevLength = viewerState.current.prevEntriesLength;
    const newLength = entries.length;

    if (isFollowing && newLength > prevLength) {
      // Follow mode: scroll to top if not paused and no rows are expanded
      if (!isFollowPaused && expandedRows.size === 0) {
        scrollToTop();
        viewerState.current.anchor = null;
      } else if (parentRef.current && viewerState.current.anchor) {
        const parent = parentRef.current;
        const anchor = viewerState.current.anchor;
        const anchorEl = parent.querySelector(`[data-cursor="${anchor.cursor}"]`);
        if (anchorEl) {
          const parentRect = parent.getBoundingClientRect();
          const anchorRect = anchorEl.getBoundingClientRect();
          const newOffset = anchorRect.top - parentRect.top;
          const delta = newOffset - anchor.offset;
          if (delta !== 0) {
            parent.scrollTop += delta;
          }
        }
      }
    }
    viewerState.current.prevEntriesLength = newLength;
  }, [entries, entries.length, expandedRows.size, isFollowing, isFollowPaused, scrollToTop]);

  // Reset user scrolled state and expanded rows when follow mode stops
  useEffect(() => {
    if (!isFollowing) {
      setUserScrolled(false);
      setExpandedRows(new Set());
    }
  }, [isFollowing]);

  // Clear expanded rows when entries change significantly (filter change)
  useEffect(() => {
    // If entries array reference changed and we're not in follow mode, clear expanded rows
    if (entriesRef.current !== entries && !isFollowing) {
      setExpandedRows(new Set());
    }
    entriesRef.current = entries;
  }, [entries, isFollowing]);

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
          {error.includes('Permission') && (
            <p className="text-sm text-theme-secondary mt-4">
              Try adding your user to the <code className="px-1 bg-theme-secondary rounded">adm</code> group:
              <br />
              <code className="text-xs px-2 py-1 bg-theme-secondary rounded block mt-2">
                sudo usermod -aG adm $USER
              </code>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!isLoading && entries.length === 0 && !isFollowing) {
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

  // Show waiting message when follow mode is active but no entries yet
  if (isFollowing && entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="relative flex justify-center mb-4">
            <span className="relative flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-6 w-6 bg-green-500"></span>
            </span>
          </div>
          <h3 className="text-lg font-medium text-theme mb-2">
            Waiting for new log entries...
          </h3>
          <p className="text-sm text-theme-secondary">
            New entries will appear here as they are written to the journal
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
      >
        {entries.length > 0 && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
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
                return (
                  <div
                    key={entry.cursor}
                    data-index={virtualRow.index}
                    data-cursor={entry.cursor}
                    ref={rowVirtualizer.measureElement}
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
        {hasMore && !isLoading && !isFollowing && (
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

      {/* Follow mode paused indicator - floating button to scroll to top */}
      {isFollowing && isFollowPaused && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={() => {
              scrollToTop();
              resume();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-medium rounded-lg shadow-lg
                       transition-colors"
          >
            <ArrowDown className="h-4 w-4 rotate-180" />
            Resume following
          </button>
        </div>
      )}
    </div>
  );
}
