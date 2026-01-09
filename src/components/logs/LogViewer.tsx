import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFollowMode } from '../../hooks/useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useScrollSyncStore } from '../../stores/scrollSyncStore';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { findEntryIndexByTimestamp, getVisibleTimestamp } from '../../lib/scrollSync';
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
  const { activeTabId } = useConnectionStore();
  const { syncEnabled, anchorTimestamp, sourceTabId, syncVersion, broadcastTimestamp } = useScrollSyncStore();
  const { pause, resume } = useFollowMode();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const [exportNotification, setExportNotification] = useState<LogExportResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Refs for timeout cleanup to prevent memory leaks
  const exportNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToLatestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      if (exportNotificationTimeoutRef.current) {
        clearTimeout(exportNotificationTimeoutRef.current);
      }
      if (scrollToLatestTimeoutRef.current) {
        clearTimeout(scrollToLatestTimeoutRef.current);
      }
      if (scrollSyncTimeoutRef.current) {
        clearTimeout(scrollSyncTimeoutRef.current);
      }
    };
  }, []);

  const handleExportComplete = useCallback((result: LogExportResult) => {
    setExportNotification(result);
    if (exportNotificationTimeoutRef.current) {
      clearTimeout(exportNotificationTimeoutRef.current);
    }
    exportNotificationTimeoutRef.current = setTimeout(() => setExportNotification(null), 3000);
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

  // Handle keyboard navigation toggle expand by index
  const handleKeyboardToggleExpand = useCallback((index: number) => {
    const entry = entries[index];
    if (entry) {
      // Use the same expand logic but called by index
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

  // Track last processed sync version to avoid duplicate scrolls
  const lastProcessedSyncVersion = useRef(0);
  // Track if we're currently syncing to avoid echo loops
  const isSyncScrolling = useRef(false);

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

  // Scroll to the end where new entries appear in follow mode
  // For newest-first (reverse: true): scroll to top
  // For oldest-first (reverse: false): scroll to bottom
  const scrollToLatest = useCallback(() => {
    if (!parentRef.current) return;
    viewerState.current.isScrolling = true;
    const isNewestFirst = filter.reverse !== false;
    if (isNewestFirst) {
      parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      parentRef.current.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'smooth' });
    }
    if (scrollToLatestTimeoutRef.current) {
      clearTimeout(scrollToLatestTimeoutRef.current);
    }
    scrollToLatestTimeoutRef.current = setTimeout(() => {
      viewerState.current.isScrolling = false;
    }, 500);
  }, [filter.reverse]);

  // Store scroll handler deps in refs to avoid recreating debounced function
  const scrollDepsRef = useRef({
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
    userScrolled,
    isNewestFirst: filter.reverse !== false,
    syncEnabled,
    activeTabId,
  });
  scrollDepsRef.current = {
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
    userScrolled,
    isNewestFirst: filter.reverse !== false,
    syncEnabled,
    activeTabId,
  };

  const handleScroll = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const scrollHandler = () => {
      if (!parentRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
      const { isFollowing, isFollowPaused, expandedRowsSize, userScrolled, isNewestFirst, syncEnabled, activeTabId } = scrollDepsRef.current;

      // Handle follow mode scroll behavior
      // For newest-first: new entries at top, so check if at top
      // For oldest-first: new entries at bottom, so check if at bottom
      if (isFollowing && !viewerState.current.isScrolling) {
        const atLatest = isNewestFirst
          ? scrollTop < 50  // At top for newest-first
          : scrollHeight - scrollTop - clientHeight < 50;  // At bottom for oldest-first

        if (!atLatest && !userScrolled) {
          // User scrolled away from latest entries - pause follow mode
          setUserScrolled(true);
          pause();
        } else if (atLatest && userScrolled) {
          // User scrolled back to latest entries - resume follow mode
          setUserScrolled(false);
          resume();
        }
      }

      // Broadcast timestamp for scroll sync (debounced separately, 150ms)
      // Skip if we're currently scrolling due to a sync event from another tab
      if (syncEnabled && !isSyncScrolling.current && !viewerState.current.isScrolling) {
        if (syncTimeoutId) {
          clearTimeout(syncTimeoutId);
        }
        syncTimeoutId = setTimeout(() => {
          const virtualItems = rowVirtualizer.getVirtualItems();
          if (virtualItems.length > 0 && entriesRef.current.length > 0) {
            const timestamp = getVisibleTimestamp(
              entriesRef.current,
              virtualItems[0].index,
              virtualItems[virtualItems.length - 1].index,
              0.3 // Upper third of viewport
            );
            if (timestamp !== null) {
              broadcastTimestamp(timestamp, activeTabId);
            }
          }
          syncTimeoutId = null;
        }, 150);
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
  }, [pause, resume, updateAnchor, broadcastTimestamp, rowVirtualizer]);

  // Handle new entries in follow mode - scroll to latest or maintain anchor position
  useEffect(() => {
    const prevLength = viewerState.current.prevEntriesLength;
    const newLength = entries.length;

    if (isFollowing && newLength > prevLength) {
      // Follow mode: scroll to latest entries if not paused and no rows are expanded
      if (!isFollowPaused && expandedRows.size === 0) {
        scrollToLatest();
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
  }, [entries, entries.length, expandedRows.size, isFollowing, isFollowPaused, scrollToLatest]);

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

  // Track which tab we last synced for, to handle tab switches
  const lastSyncedTabId = useRef<string | null>(null);

  // Handle scroll sync from other tabs
  // When anchorTimestamp changes from another tab, scroll to that timestamp
  useEffect(() => {
    // Skip if sync is disabled or no anchor timestamp
    if (!syncEnabled || anchorTimestamp === null) return;

    // Skip if this tab is the source of the sync
    if (sourceTabId === activeTabId) return;

    // Skip if entries not loaded yet (but don't mark as processed)
    if (entries.length === 0) return;

    // Skip if in follow mode (don't interrupt live streaming)
    if (isFollowing) return;

    // Check if we need to sync:
    // 1. New sync version we haven't processed
    // 2. OR we switched tabs and haven't synced this tab yet
    const isNewSync = syncVersion > lastProcessedSyncVersion.current;
    const isTabSwitch = lastSyncedTabId.current !== activeTabId;

    if (!isNewSync && !isTabSwitch) return;

    lastProcessedSyncVersion.current = syncVersion;
    lastSyncedTabId.current = activeTabId;

    // Find the closest entry to the anchor timestamp
    const isNewestFirst = filter.reverse !== false;
    const targetIndex = findEntryIndexByTimestamp(entries, anchorTimestamp, isNewestFirst);

    if (targetIndex >= 0) {
      // Mark that we're doing a sync scroll to avoid echo
      isSyncScrolling.current = true;

      // Scroll to the target index
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'smooth' });

      // Reset sync scrolling flag after animation
      if (scrollSyncTimeoutRef.current) {
        clearTimeout(scrollSyncTimeoutRef.current);
      }
      scrollSyncTimeoutRef.current = setTimeout(() => {
        isSyncScrolling.current = false;
      }, 500);
    }
  }, [syncEnabled, anchorTimestamp, sourceTabId, activeTabId, syncVersion, entries, filter.reverse, isFollowing, rowVirtualizer]);

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
        role="listbox"
        aria-label="Log entries"
        aria-activedescendant={selectedIndex !== null ? `log-entry-${selectedIndex}` : undefined}
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
                    id={`log-entry-${virtualRow.index}`}
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

      {/* Follow mode paused indicator - floating button to scroll to latest */}
      {isFollowing && isFollowPaused && (
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={() => {
              scrollToLatest();
              resume();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-medium rounded-lg shadow-lg
                       transition-colors"
          >
            <ArrowDown className={filter.reverse !== false ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
            Resume following
          </button>
        </div>
      )}
    </div>
  );
}
