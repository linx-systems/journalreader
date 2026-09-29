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
  Link,
  Unlink,
} from 'lucide-react';
import { useFilterStore } from '../../stores/filterStore';
import { useStatisticsStore } from '../../stores/statisticsStore';
import { useOfflineStore } from '../../stores/offlineStore';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useConnectionStore, LOCAL_TAB_ID } from '../../stores/connectionStore';
import { useScrollSyncStore } from '../../stores/scrollSyncStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { TabBar } from '../hosts/TabBar';
import { LayoutSelector } from './LayoutSelector';
import { isModalOpen } from '../ui/ModalDialog';
import { useEffect, useCallback } from 'react';
import clsx from 'clsx';

interface ToolbarProps {
  onRefresh: () => void;
  onToggleFollow: () => void;
  followAvailable: boolean;
}

export function Toolbar({ onRefresh, onToggleFollow, followAvailable }: ToolbarProps) {
  const entries = useFilterStore((state) => state.entries);
  const isLoading = useFilterStore((state) => state.isLoading);
  const filter = useFilterStore((state) => state.filter);
  const setFilter = useFilterStore((state) => state.setFilter);
  const isFollowing = useFilterStore((state) => state.isFollowing);
  const isFollowPaused = useFilterStore((state) => state.isFollowPaused);
  const { viewMode, setViewMode } = useStatisticsStore();
  const { isOfflineMode, setOfflineMode, triggerSync } = useOfflineStore();
  const { isSyncing } = useOfflineSync();
  const { activeTabId, openTabs } = useConnectionStore();
  const { syncEnabled, setSyncEnabled } = useScrollSyncStore();
  const { layout } = useLayoutStore();

  const handleRefresh = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  // Show offline controls when active tab is a remote host
  const showOfflineControls = activeTabId !== LOCAL_TAB_ID;

  // Show split view controls when there are multiple tabs available
  const showSplitControls = openTabs.length >= 2 || layout !== 'single';

  const toggleSortOrder = () => {
    setFilter({ reverse: !filter.reverse });
  };

  // Keyboard shortcut for follow mode (F key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen()) return;
      // Don't trigger if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && followAvailable) {
        e.preventDefault();
        onToggleFollow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [followAvailable, onToggleFollow]);

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-theme border-b border-theme gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Host Tab Bar */}
        <TabBar />

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
            aria-label="Logs"
          >
            <List className="h-4 w-4 shrink-0" />
            <span className="hidden xl:inline">Logs</span>
          </button>
          <button
            onClick={() => setViewMode('statistics')}
            className={clsx(
              'flex items-center justify-center gap-1 px-2 py-1.5 text-sm font-medium transition-colors',
              viewMode === 'statistics'
                ? 'bg-theme-secondary text-theme'
                : 'text-theme-secondary hover:text-theme hover:bg-theme-secondary/50'
            )}
            title="View statistics"
            aria-label="Stats"
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
          onClick={onToggleFollow}
          disabled={!followAvailable || (isLoading && !isFollowing)}
          className={clsx(
            'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isFollowing
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
          )}
          title={
            !followAvailable
              ? layout !== 'single'
                ? 'Follow mode is unavailable in split view'
                : isOfflineMode
                  ? 'Follow mode is unavailable offline'
                  : 'Connect the displayed host to follow it'
              : isFollowing
                ? 'Stop following (F)'
                : 'Start following new entries (F)'
          }
          aria-label={isFollowing ? 'Following' : 'Follow'}
        >
          <Radio className={clsx('h-4 w-4 shrink-0', isFollowing && 'animate-pulse')} />
          <span className="hidden xl:inline">{isFollowing ? 'Following' : 'Follow'}</span>
        </button>

        <button
          onClick={handleRefresh}
          disabled={isLoading || isFollowing}
          className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium
                     text-theme bg-theme border border-theme rounded-lg
                     hover:bg-theme-secondary transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          title={isFollowing ? 'Stop follow mode to refresh' : 'Refresh logs'}
          aria-label="Refresh"
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
          aria-label={filter.reverse ? 'Newest' : 'Oldest'}
        >
          {filter.reverse ? (
            <ArrowDown className="h-4 w-4 shrink-0" />
          ) : (
            <ArrowUp className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden xl:inline">{filter.reverse ? 'Newest' : 'Oldest'}</span>
        </button>

        {/* Scroll sync toggle - always visible for time-based navigation */}
        <button
          onClick={() => setSyncEnabled(!syncEnabled)}
          disabled={isFollowing}
          className={clsx(
            'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            syncEnabled
              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 hover:bg-purple-200 dark:hover:bg-purple-900/50'
              : 'text-theme bg-theme border border-theme hover:bg-theme-secondary'
          )}
          title={
            isFollowing
              ? 'Stop follow mode to enable time sync'
              : syncEnabled
                ? 'Disable synchronized time scrolling'
                : 'Enable synchronized time scrolling across tabs'
          }
          aria-label={syncEnabled ? 'Synced' : 'Sync Time'}
        >
          {syncEnabled ? (
            <Link className="h-4 w-4 shrink-0" />
          ) : (
            <Unlink className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden xl:inline">{syncEnabled ? 'Synced' : 'Sync Time'}</span>
        </button>

        {/* Split view layout selector */}
        {showSplitControls && (
          <>
            <div className="h-6 w-px bg-theme-secondary/30" />
            <LayoutSelector />
          </>
        )}

        {/* Offline controls - only show when active tab is a remote host */}
        {showOfflineControls && (
          <>
            {/* Divider */}
            <div className="h-6 w-px bg-theme-secondary/30" />

            {/* Sync button */}
            <button
              onClick={() => triggerSync(activeTabId)}
              disabled={isSyncing}
              className={clsx(
                'flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
                isSyncing
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                  : 'text-theme bg-theme border border-theme hover:bg-theme-secondary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title={isSyncing ? 'Syncing in progress...' : 'Sync offline logs'}
              aria-label={isSyncing ? 'Syncing' : 'Sync'}
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
              aria-label={isOfflineMode ? 'Offline' : 'Online'}
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
