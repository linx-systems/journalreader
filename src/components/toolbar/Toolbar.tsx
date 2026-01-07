import {
  RefreshCw,
  Download,
  FileJson,
  FileText,
  ArrowUp,
  ArrowDown,
  Radio,
  List,
  BarChart2,
} from 'lucide-react';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFollowMode } from '../../hooks/useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { HostSelector } from '../remote/HostSelector';
import { useState, useEffect } from 'react';
import clsx from 'clsx';

export function Toolbar() {
  const { entries, isLoading, refresh } = useJournalLogs();
  const { filter, setFilter } = useFilterStore();
  const { isFollowing, isFollowPaused, toggle } = useFollowMode();
  const { viewMode, setViewMode } = useStatisticsStore();
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

  // Keyboard shortcut for follow mode (F key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-theme border-b border-theme">
      <div className="flex items-center gap-4">
        {/* Host Selector */}
        <HostSelector />

        {/* View Mode Toggle */}
        <div className="flex items-center border border-theme rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('logs')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'logs'
                ? 'bg-theme-secondary text-theme'
                : 'text-theme-secondary hover:text-theme hover:bg-theme-secondary/50'
            )}
          >
            <List className="h-4 w-4" />
            Logs
          </button>
          <button
            onClick={() => setViewMode('statistics')}
            disabled={isFollowing}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'statistics'
                ? 'bg-theme-secondary text-theme'
                : 'text-theme-secondary hover:text-theme hover:bg-theme-secondary/50',
              isFollowing && 'opacity-50 cursor-not-allowed'
            )}
            title={isFollowing ? 'Stop follow mode to view statistics' : 'View statistics'}
          >
            <BarChart2 className="h-4 w-4" />
            Stats
          </button>
        </div>

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
        {isFollowing && (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-green-600 dark:text-green-400 font-medium">
              {isFollowPaused ? 'Paused' : 'Live'}
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Follow mode toggle */}
        <button
          onClick={toggle}
          disabled={isLoading}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     rounded-lg transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed
                     ${
                       isFollowing
                         ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/50'
                         : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
                     }`}
          title={isFollowing ? 'Stop following (F)' : 'Start following new entries (F)'}
        >
          <Radio className={`h-4 w-4 ${isFollowing ? 'animate-pulse' : ''}`} />
          {isFollowing ? 'Following' : 'Follow'}
        </button>

        <button
          onClick={refresh}
          disabled={isLoading || isFollowing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title={isFollowing ? 'Stop follow mode to refresh' : 'Refresh logs'}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>

        {/* Sort button */}
        <button
          onClick={toggleSortOrder}
          disabled={isLoading || isFollowing}
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
