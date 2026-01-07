import { useRef, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFollowMode } from '../../hooks/useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { LogEntryRow } from './LogEntry';
import { Loader2, AlertCircle, FileSearch, ArrowDown } from 'lucide-react';

export function LogViewer() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { entries, isLoading, error, hasMore, loadMore } = useJournalLogs();
  const { filter, isFollowing, isFollowPaused } = useFilterStore();
  const { pause, resume } = useFollowMode();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [userScrolled, setUserScrolled] = useState(false);
  const prevEntriesLengthRef = useRef(entries.length);
  const isScrollingRef = useRef(false);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const handleToggleExpand = useCallback((cursor: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(cursor)) {
        next.delete(cursor);
      } else {
        next.add(cursor);
      }
      return next;
    });
  }, []);

  // Scroll to top (where newest entries appear in follow mode)
  const scrollToTop = useCallback(() => {
    if (!parentRef.current) return;
    isScrollingRef.current = true;
    parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 500);
  }, []);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;

    // Handle follow mode scroll behavior
    if (isFollowing && !isScrollingRef.current) {
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

    // Handle load more (when not in follow mode)
    if (!isFollowing) {
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      if (isNearBottom && hasMore && !isLoading) {
        loadMore();
      }
    }
  }, [isFollowing, hasMore, isLoading, loadMore, pause, resume, userScrolled]);

  // Auto-scroll to top when new entries arrive in follow mode
  useEffect(() => {
    if (isFollowing && !isFollowPaused && entries.length > prevEntriesLengthRef.current) {
      // New entries arrived - scroll to top if not paused
      scrollToTop();
    }
    prevEntriesLengthRef.current = entries.length;
  }, [entries.length, isFollowing, isFollowPaused, scrollToTop]);

  // Reset user scrolled state when follow mode stops
  useEffect(() => {
    if (!isFollowing) {
      setUserScrolled(false);
    }
  }, [isFollowing]);

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
      </div>

      {/* Virtualized list */}
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index];
            const isExpanded = expandedRows.has(entry.cursor);
            return (
              <div
                key={entry.cursor}
                data-index={virtualRow.index}
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
                  onToggleExpand={() => handleToggleExpand(entry.cursor)}
                />
              </div>
            );
          })}
        </div>

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
