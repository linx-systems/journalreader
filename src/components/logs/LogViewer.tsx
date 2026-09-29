import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFilterStore } from '../../stores/filterStore';
import { LOCAL_TAB_ID, useConnectionStore } from '../../stores/connectionStore';
import { useOfflineStore } from '../../stores/offlineStore';
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

interface LogViewerProps {
  onRefresh: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  canRetry: boolean;
  onPauseFollow: () => void;
  onResumeFollow: () => void;
}

export function LogViewer({
  onRefresh,
  onLoadMore,
  onRetry,
  canRetry,
  onPauseFollow,
  onResumeFollow,
}: LogViewerProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const entries = useFilterStore((state) => state.entries);
  const resultGeneration = useFilterStore((state) => state.resultGeneration);
  const isLoading = useFilterStore((state) => state.isLoading);
  const error = useFilterStore((state) => state.error);
  const hasMore = useFilterStore((state) => state.hasMore);
  const filter = useFilterStore((state) => state.filter);
  const isFollowing = useFilterStore((state) => state.isFollowing);
  const isFollowPaused = useFilterStore((state) => state.isFollowPaused);
  const activeTabId = useConnectionStore((state) => state.activeTabId);
  const connectedHostId = useConnectionStore((state) => state.connectedHostId);
  const connectionStatus = useConnectionStore((state) => state.connectionStatus);
  const isOfflineMode = useOfflineStore((state) => state.isOfflineMode);
  const { syncEnabled, anchorTimestamp, sourceTabId, syncVersion, broadcastTimestamp } = useScrollSyncStore();
  const pause = onPauseFollow;
  const resume = onResumeFollow;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const [exportNotification, setExportNotification] = useState<LogExportResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const sourceIdentity = activeTabId === LOCAL_TAB_ID
    ? 'local'
    : `${activeTabId}:${connectedHostId === activeTabId && connectionStatus === 'connected' && !isOfflineMode ? 'remote' : 'cached'}`;
  const replacementIdentity = `${sourceIdentity}:${JSON.stringify(filter)}:${resultGeneration}`;

  const exportNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const automaticScrollFrameRef = useRef<number | null>(null);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const syncResetFrameRef = useRef<number | null>(null);
  const syncObservedScrollTopRef = useRef<number | null>(null);
  const syncPreviousScrollTopRef = useRef<number | null>(null);
  const syncStableFramesRef = useRef(0);
  const scrollSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncScrolling = useRef(false);
  const suppressNextSyncScrollRef = useRef(false);
  const cancelScheduledScrollWork = useCallback(() => {
    const parent = parentRef.current;
    const wasSyncScrolling = isSyncScrolling.current;
    const hasPendingSyncScroll =
      wasSyncScrolling
      && syncObservedScrollTopRef.current !== null
      && parent !== null
      && parent.scrollTop !== syncObservedScrollTopRef.current;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    if (automaticScrollFrameRef.current !== null) {
      cancelAnimationFrame(automaticScrollFrameRef.current);
      automaticScrollFrameRef.current = null;
    }
    if (programmaticScrollFrameRef.current !== null) {
      cancelAnimationFrame(programmaticScrollFrameRef.current);
      programmaticScrollFrameRef.current = null;
    }
    viewerState.current.isScrolling = false;
    if (syncResetFrameRef.current !== null) {
      cancelAnimationFrame(syncResetFrameRef.current);
      syncResetFrameRef.current = null;
    }
    isSyncScrolling.current = false;
    syncObservedScrollTopRef.current = null;
    syncPreviousScrollTopRef.current = null;
    syncStableFramesRef.current = 0;
    if (wasSyncScrolling) suppressNextSyncScrollRef.current = hasPendingSyncScroll;
    if (scrollSyncTimeoutRef.current) {
      clearTimeout(scrollSyncTimeoutRef.current);
      scrollSyncTimeoutRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => {
      if (exportNotificationTimeoutRef.current) {
        clearTimeout(exportNotificationTimeoutRef.current);
      }
      cancelScheduledScrollWork();
    };
  }, [cancelScheduledScrollWork]);

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
    estimateSize: () => 41,
    overscan: 10,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 41,
  });
  const isFollowingRef = useRef(isFollowing);
  const followScrollStateRef = useRef({
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
  });
  isFollowingRef.current = isFollowing;
  followScrollStateRef.current = {
    isFollowing,
    isFollowPaused,
    expandedRowsSize: expandedRows.size,
  };

  const toggleExpandedCursor = useCallback((cursor: string) => {
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
    cancelScheduledScrollWork();

    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(cursor)) {
        next.delete(cursor);
      } else {
        next.add(cursor);
        viewerState.current.lastExpandedCursor = cursor;
      }
      if (isFollowingRef.current) {
        pause();
      }
      return next;
    });
  }, [cancelScheduledScrollWork, pause]);

  const handleKeyboardToggleExpand = useCallback((index: number) => {
    const entry = entries[index];
    if (entry) {
      toggleExpandedCursor(entry.cursor);
    }
  }, [entries, toggleExpandedCursor]);

  // Keyboard navigation for log list
  useKeyboardNavigation({
    itemCount: entries.length,
    selectedIndex,
    onSelectionChange: setSelectedIndex,
    onToggleExpand: handleKeyboardToggleExpand,
    virtualizer: rowVirtualizer,
    enabled: !isLoading && entries.length > 0,
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


  // Track last processed sync version to avoid duplicate scrolls
  const lastProcessedSyncVersion = useRef(0);

  const handleToggleExpand = toggleExpandedCursor;

  const isAtLatest = useCallback((element: HTMLDivElement) => (
    filter.reverse !== false
      ? element.scrollTop < 1
      : element.scrollHeight - element.scrollTop - element.clientHeight < 1
  ), [filter.reverse]);

  const scrollToLatest = useCallback((smooth = false, automatic = false) => {
    if (
      automatic
      && (
        !followScrollStateRef.current.isFollowing
        || followScrollStateRef.current.isFollowPaused
        || followScrollStateRef.current.expandedRowsSize > 0
      )
    ) {
      return;
    }
    const parent = parentRef.current;
    if (!parent) return;

    viewerState.current.isScrolling = true;
    parent.scrollTo({
      top: filter.reverse !== false ? 0 : parent.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });

    if (programmaticScrollFrameRef.current !== null) {
      cancelAnimationFrame(programmaticScrollFrameRef.current);
    }
    let previousPosition = parent.scrollTop;
    let remainingIdleFrames = 2;
    const finishProgrammaticScroll = () => {
      const currentParent = parentRef.current;
      if (!currentParent || isAtLatest(currentParent)) {
        viewerState.current.isScrolling = false;
        programmaticScrollFrameRef.current = null;
        return;
      }
      if (currentParent.scrollTop === previousPosition) {
        remainingIdleFrames -= 1;
        if (remainingIdleFrames === 0) {
          viewerState.current.isScrolling = false;
          programmaticScrollFrameRef.current = null;
          return;
        }
      } else {
        previousPosition = currentParent.scrollTop;
        remainingIdleFrames = 2;
      }
      programmaticScrollFrameRef.current = requestAnimationFrame(finishProgrammaticScroll);
    };
    programmaticScrollFrameRef.current = requestAnimationFrame(finishProgrammaticScroll);
  }, [filter.reverse, isAtLatest]);

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

  useEffect(() => {
    if (!isFollowing || isFollowPaused || expandedRows.size > 0) {
      cancelScheduledScrollWork();
    }
  }, [cancelScheduledScrollWork, expandedRows.size, isFollowing, isFollowPaused]);

  const handleScroll = useCallback(() => {
    if (isSyncScrolling.current) {
      syncObservedScrollTopRef.current = parentRef.current?.scrollTop ?? null;
      suppressNextSyncScrollRef.current = false;
      return;
    }
    if (suppressNextSyncScrollRef.current) {
      suppressNextSyncScrollRef.current = false;
      return;
    }
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const parent = parentRef.current;
      if (!parent) return;

      const { scrollTop, scrollHeight, clientHeight } = parent;
      const { isFollowing, isFollowPaused, expandedRowsSize, userScrolled, isNewestFirst, syncEnabled, activeTabId } = scrollDepsRef.current;

      if (isSyncScrolling.current) return;

      if (isFollowing && !viewerState.current.isScrolling) {
        const atLatest = isNewestFirst
          ? scrollTop < 50
          : scrollHeight - scrollTop - clientHeight < 50;

        if (!atLatest && !userScrolled) {
          updateAnchor();
          setUserScrolled(true);
          pause();
        } else if (atLatest && userScrolled) {
          setUserScrolled(false);
          resume();
        }
      }

      if (syncEnabled && !isSyncScrolling.current && !viewerState.current.isScrolling) {
        if (scrollSyncTimeoutRef.current) {
          clearTimeout(scrollSyncTimeoutRef.current);
        }
        scrollSyncTimeoutRef.current = setTimeout(() => {
          const virtualItems = rowVirtualizer.getVirtualItems();
          if (virtualItems.length > 0 && entriesRef.current.length > 0) {
            const timestamp = getVisibleTimestamp(
              entriesRef.current,
              virtualItems[0].index,
              virtualItems[virtualItems.length - 1].index,
              0.3,
            );
            if (timestamp !== null) {
              broadcastTimestamp(timestamp, activeTabId);
            }
          }
          scrollSyncTimeoutRef.current = null;
        }, 150);
      }

      if (isFollowing && (isFollowPaused || expandedRowsSize > 0)) {
        updateAnchor(viewerState.current.lastExpandedCursor ?? undefined);
      } else if (!isFollowing || (!isFollowPaused && expandedRowsSize === 0)) {
        viewerState.current.anchor = null;
      }
    });
  }, [broadcastTimestamp, pause, resume, rowVirtualizer, updateAnchor]);

  useLayoutEffect(() => {
    const previousLength = viewerState.current.prevEntriesLength;
    const currentLength = entries.length;

    if (isFollowing && currentLength > previousLength) {
      if (!isFollowPaused && expandedRows.size === 0) {
        if (automaticScrollFrameRef.current !== null) {
          cancelAnimationFrame(automaticScrollFrameRef.current);
        }
        automaticScrollFrameRef.current = requestAnimationFrame(() => {
          automaticScrollFrameRef.current = null;
          scrollToLatest(false, true);
        });
        viewerState.current.anchor = null;
      } else if (parentRef.current && viewerState.current.anchor) {
        const parent = parentRef.current;
        const anchor = viewerState.current.anchor;
        const anchorIndex = entries.findIndex((entry) => entry.cursor === anchor.cursor);
        const anchorStart = anchorIndex >= 0
          ? rowVirtualizer.measurementsCache[anchorIndex]?.start
          : undefined;
        if (anchorStart !== undefined) {
          parent.scrollTop = anchorStart - anchor.offset;
        }

        const anchorEl = parent.querySelector(`[data-cursor="${anchor.cursor}"]`);
        if (anchorEl) {
          const parentRect = parent.getBoundingClientRect();
          const newOffset = anchorEl.getBoundingClientRect().top - parentRect.top;
          parent.scrollTop += newOffset - anchor.offset;
        }
      }
    }
    viewerState.current.prevEntriesLength = currentLength;
  }, [entries, expandedRows.size, isFollowing, isFollowPaused, rowVirtualizer, scrollToLatest]);
  const previousReplacementIdentityRef = useRef(replacementIdentity);
  useLayoutEffect(() => {
    if (previousReplacementIdentityRef.current === replacementIdentity) return;

    previousReplacementIdentityRef.current = replacementIdentity;
    cancelScheduledScrollWork();
    viewerState.current.anchor = null;
    viewerState.current.lastExpandedCursor = null;
    viewerState.current.prevEntriesLength = entries.length;
    viewerState.current.isScrolling = false;
    setExpandedRows(new Set());
    setSelectedIndex(null);
    setUserScrolled(false);
    parentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [cancelScheduledScrollWork, entries.length, replacementIdentity]);


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
      const scrollTopBefore = parentRef.current?.scrollTop;
      isSyncScrolling.current = true;
      suppressNextSyncScrollRef.current = true;
      syncObservedScrollTopRef.current = scrollTopBefore ?? null;
      syncPreviousScrollTopRef.current = scrollTopBefore ?? null;
      syncStableFramesRef.current = 0;
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'auto' });
      if (syncResetFrameRef.current !== null) {
        cancelAnimationFrame(syncResetFrameRef.current);
      }
      const finishSyncScroll = () => {
        const parent = parentRef.current;
        if (!parent) {
          isSyncScrolling.current = false;
          suppressNextSyncScrollRef.current = false;
          syncObservedScrollTopRef.current = null;
          syncPreviousScrollTopRef.current = null;
          syncStableFramesRef.current = 0;
          syncResetFrameRef.current = null;
          return;
        }

        if (parent.scrollTop === syncPreviousScrollTopRef.current) {
          syncStableFramesRef.current += 1;
        } else {
          syncPreviousScrollTopRef.current = parent.scrollTop;
          syncStableFramesRef.current = 0;
        }

        if (syncStableFramesRef.current < 2) {
          syncResetFrameRef.current = requestAnimationFrame(finishSyncScroll);
          return;
        }

        suppressNextSyncScrollRef.current = false;
        isSyncScrolling.current = false;
        syncObservedScrollTopRef.current = null;
        syncPreviousScrollTopRef.current = null;
        syncStableFramesRef.current = 0;
        syncResetFrameRef.current = null;
      };
      syncResetFrameRef.current = requestAnimationFrame(finishSyncScroll);
    }
  }, [syncEnabled, anchorTimestamp, sourceTabId, activeTabId, syncVersion, entries, filter.reverse, isFollowing, rowVirtualizer]);


  if (error && entries.length === 0) {
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
          <button
            onClick={canRetry ? onRetry : onRefresh}
            className="mt-4 text-sm accent-theme hover:opacity-80"
            title={canRetry ? 'Retry loading logs' : 'Refresh logs'}
          >
            Retry
          </button>
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
      {error && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" role="alert">
          <span>{error}</span>
          <div className="flex shrink-0 gap-3">
            {canRetry && (
              <button onClick={onRetry} className="accent-theme hover:opacity-80" title="Retry loading logs">
                Retry
              </button>
            )}
            <button onClick={onRefresh} className="accent-theme hover:opacity-80" title="Refresh logs">
              Refresh logs
            </button>
          </div>
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
              onClick={onLoadMore}
              className="text-sm accent-theme hover:opacity-80"
              title="Load more logs"
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
              scrollToLatest(true);
              setUserScrolled(false);
              resume();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-medium rounded-lg shadow-lg
                       transition-colors"
            title="Resume following new log entries"
          >
            <ArrowDown className={filter.reverse !== false ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
            Resume following
          </button>
        </div>
      )}
    </div>
  );
}
