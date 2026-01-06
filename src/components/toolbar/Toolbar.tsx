import { RefreshCw, Download, FileJson, FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFilterStore } from '../../stores/filterStore';
import { useState } from 'react';

export function Toolbar() {
  const { entries, isLoading, refresh } = useJournalLogs();
  const { filter, setFilter } = useFilterStore();
  const [showExportMenu, setShowExportMenu] = useState(false);

  const toggleSortOrder = () => {
    setFilter({ reverse: !filter.reverse });
  };

  const handleExportJson = () => {
    const data = JSON.stringify(entries, null, 2);
    downloadFile(data, 'journal-logs.json', 'application/json');
    setShowExportMenu(false);
  };

  const handleExportText = () => {
    const lines = entries.map((e) => {
      const date = new Date(e.realtimeTimestamp / 1000).toISOString();
      const unit = e.systemdUnit || e.syslogIdentifier || '-';
      return `${date} [${unit}] ${e.message}`;
    });
    const data = lines.join('\n');
    downloadFile(data, 'journal-logs.txt', 'text/plain');
    setShowExportMenu(false);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-theme border-b border-theme">
      <div className="flex items-center gap-4">
        <span className="text-sm text-theme-secondary">
          {isLoading ? (
            'Loading...'
          ) : (
            <>
              <span className="font-medium text-theme">
                {entries.length.toLocaleString()}
              </span>{' '}
              entries
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        {/* Sort button */}
        <button
          onClick={toggleSortOrder}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title={filter.reverse ? 'Sorted: Newest first' : 'Sorted: Oldest first'}
        >
          {filter.reverse ? (
            <ArrowDown className="h-4 w-4" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
          {filter.reverse ? 'Newest' : 'Oldest'}
        </button>

        {/* Export dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={entries.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                       text-theme bg-theme border border-theme rounded-lg
                       hover:bg-theme-secondary transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          {showExportMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-theme border border-theme rounded-lg shadow-lg z-10">
              <button
                onClick={handleExportJson}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                           hover:bg-theme-secondary rounded-t-lg transition-colors"
              >
                <FileJson className="h-4 w-4" />
                Export as JSON
              </button>
              <button
                onClick={handleExportText}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                           hover:bg-theme-secondary rounded-b-lg transition-colors"
              >
                <FileText className="h-4 w-4" />
                Export as Text
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
