import {
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Radio,
  List,
  BarChart2,
  Wifi,
  WifiOff,
  CloudDownload,
} from 'lucide-react';
import { useJournalLogs } from '../../hooks/useJournalLogs';
import { useFollowMode } from '../../hooks/useFollowMode';
import { useFilterStore } from '../../stores/filterStore';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useConnectionStore } from '../../stores/connectionStore';
import { HostSelector } from '../remote/HostSelector';
import { useEffect } from 'react';
import clsx from 'clsx';

export function Toolbar() {
  const { entries, isLoading, refresh } = useJournalLogs();
  const { filter, setFilter } = useFilterStore();
  const { isFollowing, isFollowPaused, toggle } = useFollowMode();
  const { viewMode, setViewMode } = useStatisticsStore();
  const { isOfflineMode, setOfflineMode, triggerSync } = useOfflineStore();
  const { isSyncing } = useOfflineSync();
  const { connectedHostId } = useConnectionStore();

  const toggleSortOrder = () => {
    setFilter({ reverse: !filter.reverse });
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
    <div className="flex items-center justify-between px-3 py-2 bg-theme border-b border-theme gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Host Selector */}
        <HostSelector />

        {/* View Mode Toggle */}
        <div className="flex items-center border border-theme rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode('logs')}
            className={clsx(
              'flex items-center justify-center gap-1 px-2 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'logs'
                ? 'bg-theme-secondary text-theme'
                : 'text-theme-secondary hover:text-theme hover:bg-theme-secondary/50'
            )}
            title="View logs"
          >
            <List className="h-4 w-4 shrink-0" />
            <span className="hidden xl:inline">Logs</span>
          </button>
          <button
            onClick={() => setViewMode('statistics')}
            disabled={isFollowing}
            className={clsx(
              'flex items-center justify-center gap-1 px-2 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'statistics'
                ? 'bg-theme-secondary text-theme'
                : 'text-theme-secondary hover:text-theme hover:bg-theme-secondary/50',
              isFollowing && 'opacity-50 cursor-not-allowed'
            )}
            title={isFollowing ? 'Stop follow mode to view statistics' : 'View statistics'}
          >
            <BarChart2 className="h-4 w-4 shrink-0" />
            <span className="hidden xl:inline">Stats</span>
          </button>
        </div>

        <span className="text-sm text-theme-secondary whitespace-nowrap">
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

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Follow mode toggle */}
        <button
          onClick={toggle}
          disabled={isLoading}
          className={clsx(
            'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isFollowing
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
          )}
          title={isFollowing ? 'Stop following (F)' : 'Start following new entries (F)'}
        >
          <Radio className={clsx('h-4 w-4 shrink-0', isFollowing && 'animate-pulse')} />
          <span className="hidden xl:inline">{isFollowing ? 'Following' : 'Follow'}</span>
        </button>

        <button
          onClick={refresh}
          disabled={isLoading || isFollowing}
          className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title={isFollowing ? 'Stop follow mode to refresh' : 'Refresh logs'}
        >
          <RefreshCw className={clsx('h-4 w-4 shrink-0', isLoading && 'animate-spin')} />
          <span className="hidden xl:inline">Refresh</span>
        </button>

        {/* Sort button */}
        <button
          onClick={toggleSortOrder}
          disabled={isLoading || isFollowing}
          className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title={filter.reverse ? 'Sorted: Newest first' : 'Sorted: Oldest first'}
        >
          {filter.reverse ? (
            <ArrowDown className="h-4 w-4 shrink-0" />
          ) : (
            <ArrowUp className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden xl:inline">{filter.reverse ? 'Newest' : 'Oldest'}</span>
        </button>

        {/* Offline controls - only show when connected to a remote host */}
        {connectedHostId && (
          <>
            {/* Divider */}
            <div className="h-6 w-px bg-theme-secondary/30" />

            {/* Sync button */}
            <button
              onClick={() => triggerSync(connectedHostId)}
              disabled={isSyncing}
              className={clsx(
                'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
                isSyncing
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                  : 'text-theme bg-theme border border-theme hover:bg-theme-secondary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title={isSyncing ? 'Syncing in progress...' : 'Sync offline logs'}
            >
              <CloudDownload className={clsx('h-4 w-4 shrink-0', isSyncing && 'animate-pulse')} />
              <span className="hidden xl:inline">{isSyncing ? 'Syncing' : 'Sync'}</span>
            </button>

            {/* Offline mode toggle */}
            <button
              onClick={() => setOfflineMode(!isOfflineMode)}
              className={clsx(
                'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
                isOfflineMode
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                  : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
              )}
              title={isOfflineMode ? 'Switch to online mode' : 'Switch to offline mode'}
            >
              {isOfflineMode ? (
                <WifiOff className="h-4 w-4 shrink-0" />
              ) : (
                <Wifi className="h-4 w-4 shrink-0" />
              )}
              <span className="hidden xl:inline">{isOfflineMode ? 'Offline' : 'Online'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
