import { useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFilterStore } from '../../stores/filterStore';
import { LogEntryRow } from './LogEntry';
import { Loader2, AlertCircle, FileSearch } from 'lucide-react';

export function LogViewer() {
  const parentRef = useRef<HTMLDivElement>(null);
  const { entries, isLoading, error, hasMore, loadMore } = useJournalLogs();
  const { filter } = useFilterStore();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;

    if (isNearBottom && hasMore && !isLoading) {
      loadMore();
    }
  }, [hasMore, isLoading, loadMore]);

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
    <div className="flex-1 flex flex-col min-h-0">
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
