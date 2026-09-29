import { useState, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useBoots } from '../../hooks/useUnits';
import { HardDrive, ChevronDown, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

export function BootSelector() {
  const { filter, setFilter } = useFilterStore();
  const { boots, isLoading, refresh } = useBoots();
  const [isOpen, setIsOpen] = useState(false);

  // Sort boots: current boot first (offset 0), then by offset descending
  const sortedBoots = useMemo(() => {
    return [...boots].sort((a, b) => b.bootOffset - a.bootOffset);
  }, [boots]);

  // Get all boots except current for the "previous boots" section
  const previousBoots = useMemo(() => {
    return sortedBoots.filter(b => b.bootOffset !== 0);
  }, [sortedBoots]);

  // Get current boot info
  const currentBoot = useMemo(() => {
    return boots.find(b => b.bootOffset === 0);
  }, [boots]);

  const selectedBoot = useMemo(() => {
    if (filter.bootId) {
      return boots.find(b => b.bootId === filter.bootId);
    }
    if (filter.bootOffset !== undefined) {
      return boots.find(b => b.bootOffset === filter.bootOffset);
    }
    return null;
  }, [boots, filter.bootId, filter.bootOffset]);

  const handleSelectBoot = (bootOffset: number) => {
    setFilter({
      bootId: undefined,
      bootOffset: bootOffset,
      since: undefined,
      until: undefined
    });
    setIsOpen(false);
  };

  const handleClearBoot = () => {
    setFilter({
      bootId: undefined,
      bootOffset: undefined,
      since: '15 minutes ago'
    });
    setIsOpen(false);
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refresh();
  };

  const formatBootTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp / 1000);
    return format(date, 'MMM d, HH:mm');
  };

  const formatBootDuration = (firstEntry?: number, lastEntry?: number) => {
    if (!firstEntry || !lastEntry) return '';
    const durationMs = (lastEntry - firstEntry) / 1000;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getBootLabel = (boot: typeof boots[0]) => {
    if (boot.bootOffset === 0) {
      return 'Current boot';
    }
    if (boot.bootOffset === -1) {
      return 'Previous boot';
    }
    return `${Math.abs(boot.bootOffset)} boots ago`;
  };

  const getRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp / 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const isBootSelected = filter.bootOffset !== undefined || filter.bootId !== undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-theme-secondary" />
        <label className="block text-sm font-medium text-theme">
          Boot Session
        </label>
        {boots.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-theme-secondary text-theme-secondary">
            {boots.length} {boots.length === 1 ? 'boot' : 'boots'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 text-theme-secondary hover:text-theme transition-colors disabled:opacity-50"
            title="Refresh boot list"
            aria-label="Refresh boot list"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
          {isBootSelected && (
            <button
              onClick={handleClearBoot}
              className="text-xs text-theme-secondary hover:text-theme transition-colors"
              title="Clear boot filter"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 border border-theme
                     rounded-lg bg-theme text-theme text-sm"
          title={isOpen ? 'Collapse boot selector' : 'Expand boot selector'}
        >
          <span className={clsx(
            isBootSelected ? 'text-theme' : 'text-theme-secondary'
          )}>
            {selectedBoot ? getBootLabel(selectedBoot) : 'All boots'}
          </span>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-theme border border-theme
                          rounded-lg shadow-lg max-h-96 overflow-hidden">
            {/* All boots option */}
            <button
              onClick={handleClearBoot}
              className={clsx(
                'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors border-b border-theme',
                !isBootSelected && 'selection-theme'
              )}
              title="Show logs from all boot sessions"
            >
              <span className="font-medium">All boots</span>
              <span className="block text-xs text-theme-secondary">Show logs from all boot sessions</span>
            </button>

            {/* Current boot special option */}
            {currentBoot && (
              <button
                onClick={() => handleSelectBoot(0)}
                className={clsx(
                  'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors border-b border-theme',
                  filter.bootOffset === 0 && 'selection-theme'
                )}
                title="Show logs from current boot"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Current boot</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    Active
                  </span>
                </div>
                <div className="text-xs text-theme-secondary mt-0.5">
                  Started {formatBootTime(currentBoot.firstEntry)}
                  {currentBoot.firstEntry && currentBoot.lastEntry && (
                    <span className="ml-2">
                      (running {formatBootDuration(currentBoot.firstEntry, currentBoot.lastEntry)})
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-theme-secondary mt-0.5 truncate opacity-50">
                  {currentBoot.bootId.substring(0, 16)}...
                </div>
              </button>
            )}

            {/* Previous boots section */}
            <div className="overflow-y-auto max-h-64">
              {isLoading ? (
                <div className="p-3 text-sm text-theme-secondary text-center">Loading boots...</div>
              ) : previousBoots.length === 0 ? (
                <div className="p-3 text-sm text-theme-secondary text-center">No previous boots found</div>
              ) : (
                <>
                  <div className="px-3 py-1.5 text-xs font-medium text-theme-secondary bg-theme-secondary border-b border-theme">
                    Previous Boots
                  </div>
                  {previousBoots.map((boot) => (
                    <button
                      key={boot.bootId}
                      onClick={() => handleSelectBoot(boot.bootOffset)}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors',
                        (filter.bootOffset === boot.bootOffset || filter.bootId === boot.bootId) && 'selection-theme'
                      )}
                      title={`Show logs from ${getBootLabel(boot)}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{getBootLabel(boot)}</span>
                      </div>
                      <div className="text-xs text-theme-secondary mt-0.5">
                        {formatBootTime(boot.firstEntry)}
                        {boot.firstEntry && boot.lastEntry && (
                          <span className="ml-2">
                            ({formatBootDuration(boot.firstEntry, boot.lastEntry)})
                          </span>
                        )}
                        {boot.lastEntry && (
                          <span className="ml-2 italic">
                            {getRelativeTime(boot.lastEntry)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-theme-secondary mt-0.5 truncate opacity-50">
                        {boot.bootId.substring(0, 16)}...
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
