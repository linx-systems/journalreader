import { useState, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useBoots } from '../../hooks/useUnits';
import { HardDrive, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

export function BootSelector() {
  const { filter, setFilter } = useFilterStore();
  const { boots, isLoading } = useBoots();
  const [isOpen, setIsOpen] = useState(false);

  const sortedBoots = useMemo(() => {
    return [...boots].sort((a, b) => b.bootOffset - a.bootOffset);
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
    return `Boot ${boot.bootOffset}`;
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
        {isBootSelected && (
          <button
            onClick={handleClearBoot}
            className="ml-auto text-xs text-theme-secondary hover:text-theme transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 border border-theme
                     rounded-lg bg-theme text-theme text-sm"
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
                          rounded-lg shadow-lg max-h-60 overflow-hidden">
            {/* All boots option */}
            <button
              onClick={handleClearBoot}
              className={clsx(
                'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors border-b border-theme',
                !isBootSelected && 'selection-theme'
              )}
            >
              <span className="font-medium">All boots</span>
              <span className="block text-xs text-theme-secondary">Show logs from all boot sessions</span>
            </button>

            <div className="overflow-y-auto max-h-48">
              {isLoading ? (
                <div className="p-3 text-sm text-theme-secondary text-center">Loading boots...</div>
              ) : sortedBoots.length === 0 ? (
                <div className="p-3 text-sm text-theme-secondary text-center">No boots found</div>
              ) : (
                sortedBoots.map((boot) => (
                  <button
                    key={boot.bootId}
                    onClick={() => handleSelectBoot(boot.bootOffset)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors',
                      (filter.bootOffset === boot.bootOffset || filter.bootId === boot.bootId) && 'selection-theme'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{getBootLabel(boot)}</span>
                      {boot.bootOffset === 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-theme-secondary mt-0.5">
                      {formatBootTime(boot.firstEntry)}
                      {boot.firstEntry && boot.lastEntry && (
                        <span className="ml-2">
                          ({formatBootDuration(boot.firstEntry, boot.lastEntry)})
                        </span>
                      )}
                      {boot.bootOffset !== 0 && boot.lastEntry && (
                        <span className="ml-2 italic">
                          {getRelativeTime(boot.lastEntry)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-theme-secondary mt-0.5 truncate opacity-50">
                      {boot.bootId.substring(0, 16)}...
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
