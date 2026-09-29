import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePanelJournalLogs, type PanelPosition } from '../../hooks/usePanelJournalLogs';
import { useFilterStore } from '../../stores/filterStore';
import { LOCAL_TAB_ID, useConnectionStore } from '../../stores/connectionStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useScrollSyncStore } from '../../stores/scrollSyncStore';
import { useSplitPanelStore } from '../../stores/splitPanelStore';
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation';
import { findEntryIndexByTimestamp, getVisibleTimestamp } from '../../lib/scrollSync';
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
  const {
    entries,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    retry,
    canRetry,
  } = usePanelJournalLogs({
    hostId,
    panelPosition,
  });
  const filter = useFilterStore((state) => state.filter);
  const connectedHostId = useConnectionStore((state) => state.connectedHostId);
  const connectionStatus = useConnectionStore((state) => state.connectionStatus);
  const isOfflineMode = useOfflineStore((state) => state.isOfflineMode);
  const { syncEnabled, anchorTimestamp, sourceTabId, syncVersion, broadcastTimestamp } = useScrollSyncStore();
  const panelResultGeneration = useSplitPanelStore((state) => (
    panelPosition === 'left'
      ? state.leftPanel.resultGeneration
      : state.rightPanel.resultGeneration
  ));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exportNotification, setExportNotification] = useState<LogExportResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const sourceIdentity = hostId === LOCAL_TAB_ID
    ? 'local'
    : `${hostId}:${connectedHostId === hostId && connectionStatus === 'connected' && !isOfflineMode ? 'remote' : 'cached'}`;
  const replacementIdentity = `${sourceIdentity}:${JSON.stringify(filter)}:${panelResultGeneration}`;

  const exportNotificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
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

  useEffect(() => () => {
    if (exportNotificationTimeoutRef.current) {
      clearTimeout(exportNotificationTimeoutRef.current);
    }
    cancelScheduledScrollWork();
  }, [cancelScheduledScrollWork]);

  const handleExportComplete = useCallback((result: LogExportResult) => {
    setExportNotification(result);
    if (exportNotificationTimeoutRef.current) {
      clearTimeout(exportNotificationTimeoutRef.current);
    }
    exportNotificationTimeoutRef.current = setTimeout(() => setExportNotification(null), 3000);
  }, []);

  const viewerState = useRef<ViewerState>({
    prevEntriesLength: entries.length,
    isScrolling: false,
    anchor: null,
    lastExpandedCursor: null,
  });

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const getItemKey = useCallback((index: number) => (
    entriesRef.current[index]?.cursor ?? index
  ), []);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    getItemKey,
    estimateSize: () => 41,
    overscan: 10,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 41,
  });

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
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(cursor)) {
        next.delete(cursor);
      } else {
        next.add(cursor);
        viewerState.current.lastExpandedCursor = cursor;
      }
      return next;
    });
  }, []);

  const handleKeyboardToggleExpand = useCallback((index: number) => {
    const entry = entries[index];
    if (entry) {
      toggleExpandedCursor(entry.cursor);
    }
  }, [entries, toggleExpandedCursor]);

  useKeyboardNavigation({
    itemCount: entries.length,
    selectedIndex,
    onSelectionChange: setSelectedIndex,
    onToggleExpand: handleKeyboardToggleExpand,
    virtualizer: rowVirtualizer,
    enabled: !isLoading && entries.length > 0,
  });

  const scrollDepsRef = useRef({ syncEnabled });
  scrollDepsRef.current = { syncEnabled };

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
      if (
        !parentRef.current
        || !scrollDepsRef.current.syncEnabled
        || isSyncScrolling.current
      ) return;

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
            broadcastTimestamp(timestamp, hostId);
          }
        }
        scrollSyncTimeoutRef.current = null;
      }, 150);
    });
  }, [broadcastTimestamp, hostId, rowVirtualizer]);

  const previousReplacementIdentityRef = useRef(replacementIdentity);
  useLayoutEffect(() => {
    if (previousReplacementIdentityRef.current === replacementIdentity) return;

    previousReplacementIdentityRef.current = replacementIdentity;
    cancelScheduledScrollWork();
    viewerState.current.anchor = null;
    viewerState.current.lastExpandedCursor = null;
    viewerState.current.prevEntriesLength = entries.length;
    setExpandedRows(new Set());
    setSelectedIndex(null);
    parentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [cancelScheduledScrollWork, entries.length, replacementIdentity]);

  const handleToggleExpand = toggleExpandedCursor;

  const lastProcessedSyncVersion = useRef(0);
  // Track which host we last synced for, to handle host switches
  const lastSyncedHostId = useRef<string | null>(null);

  // Handle scroll sync from other panels
  // When anchorTimestamp changes from another panel, scroll to that timestamp
  useEffect(() => {
    // Skip if sync is disabled or no anchor timestamp
    if (!syncEnabled || anchorTimestamp === null) return;

    // Skip if this panel is the source of the sync
    if (sourceTabId === hostId) return;

    // Skip if entries not loaded yet
    if (entries.length === 0) return;

    // Check if we need to sync:
    // 1. New sync version we haven't processed
    // 2. OR we switched hosts and haven't synced this host yet
    const isNewSync = syncVersion > lastProcessedSyncVersion.current;
    const isHostSwitch = lastSyncedHostId.current !== hostId;

    if (!isNewSync && !isHostSwitch) return;

    lastProcessedSyncVersion.current = syncVersion;
    lastSyncedHostId.current = hostId;

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
  }, [syncEnabled, anchorTimestamp, sourceTabId, hostId, syncVersion, entries, filter.reverse, rowVirtualizer]);


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
          <div className="flex justify-center gap-4 mt-4">
            <button
              onClick={canRetry ? retry : refresh}
              className="text-sm accent-theme hover:opacity-80"
              title={canRetry ? 'Retry loading logs' : 'Refresh logs'}
            >
              Retry
            </button>
          </div>
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
      {error && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" role="alert">
          <span>{error}</span>
          <div className="flex shrink-0 gap-3">
            {canRetry && (
              <button onClick={retry} className="accent-theme hover:opacity-80" title="Retry loading logs">
                Retry
              </button>
            )}
            <button onClick={refresh} className="accent-theme hover:opacity-80" title="Refresh logs">
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
              title="Load more logs"
            >
              Load more...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
