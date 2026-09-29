import { useFilterStore } from '../../stores/filterStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { QUICK_FILTERS, DEFAULT_FILTER } from '../../lib/types';
import type { QuickFilter } from '../../lib/types';
import { Zap } from 'lucide-react';
import clsx from 'clsx';

export function QuickFilters() {
  const { filter, setFilter, resetFilter } = useFilterStore();
  const { setActiveBookmark } = useBookmarkStore();

  const isQuickFilterActive = (qf: QuickFilter): boolean => {
    const { priorities, since, bootOffset } = qf.filters;

    // Check priorities match
    if (priorities !== undefined) {
      if (!filter.priorities) return false;
      if (filter.priorities.length !== priorities.length) return false;
      if (!priorities.every((p) => filter.priorities?.includes(p))) return false;
    }

    // Check since matches
    if (since !== undefined && filter.since !== since) return false;

    // Check bootOffset matches
    if (bootOffset !== undefined && filter.bootOffset !== bootOffset) return false;

    return true;
  };

  const handleQuickFilterClick = (qf: QuickFilter) => {
    // Clear any active bookmark when using quick filters
    setActiveBookmark(null);

    if (isQuickFilterActive(qf)) {
      // If already active, reset to default
      resetFilter();
    } else {
      // Apply quick filter on top of defaults
      setFilter({
        ...DEFAULT_FILTER,
        since: '15 minutes ago',
        ...qf.filters,
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-theme-secondary" />
        <span className="text-sm font-medium text-theme">Quick Filters</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_FILTERS.map((qf) => {
          const isActive = isQuickFilterActive(qf);
          return (
            <button
              key={qf.id}
              onClick={() => handleQuickFilterClick(qf)}
              className={clsx(
                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-theme-secondary text-theme-secondary hover:bg-theme-tertiary hover:text-theme'
              )}
              title={isActive ? `Clear ${qf.label} quick filter` : `Apply ${qf.label} quick filter`}
            >
              {qf.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
