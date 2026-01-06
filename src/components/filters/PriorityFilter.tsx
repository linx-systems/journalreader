import { useFilterStore } from '../../stores/filterStore';
import { PRIORITY_LABELS } from '../../lib/types';
import clsx from 'clsx';

const PRIORITIES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

// Short labels to fit all priorities in view
const SHORT_LABELS: Record<number, string> = {
  0: 'emg',
  1: 'alrt',
  2: 'crit',
  3: 'err',
  4: 'warn',
  5: 'note',
  6: 'info',
  7: 'dbg',
};

const PRIORITY_CSS_CLASSES: Record<number, string> = {
  0: 'log-emerg priority-bg-emerg',
  1: 'log-alert priority-bg-alert',
  2: 'log-crit priority-bg-crit',
  3: 'log-err priority-bg-err',
  4: 'log-warning priority-bg-warning',
  5: 'log-notice priority-bg-notice',
  6: 'log-info priority-bg-info',
  7: 'log-debug priority-bg-debug',
};

export function PriorityFilter() {
  const { filter, setFilter } = useFilterStore();

  const isSelected = (priority: number) => {
    const min = filter.priorityMin ?? 0;
    const max = filter.priorityMax ?? 7;
    return priority >= min && priority <= max;
  };

  const handleToggle = (priority: number) => {
    const currentMin = filter.priorityMin ?? 0;
    const currentMax = filter.priorityMax ?? 7;

    if (isSelected(priority)) {
      // If it's the only selected, select all
      if (currentMin === priority && currentMax === priority) {
        setFilter({ priorityMin: undefined, priorityMax: undefined });
      } else if (priority === currentMin) {
        setFilter({ priorityMin: currentMin + 1 });
      } else if (priority === currentMax) {
        setFilter({ priorityMax: currentMax - 1 });
      } else {
        // Clicked in the middle of the range - shrink to the closer edge
        const distToMin = priority - currentMin;
        const distToMax = currentMax - priority;
        if (distToMin <= distToMax) {
          // Closer to min, set new max to priority - 1
          setFilter({ priorityMax: priority - 1 });
        } else {
          // Closer to max, set new min to priority + 1
          setFilter({ priorityMin: priority + 1 });
        }
      }
    } else {
      // Extend range to include this priority
      const newMin = Math.min(currentMin, priority);
      const newMax = Math.max(currentMax, priority);
      setFilter({
        priorityMin: newMin === 0 ? undefined : newMin,
        priorityMax: newMax === 7 ? undefined : newMax
      });
    }
  };

  const selectAll = () => {
    setFilter({ priorityMin: undefined, priorityMax: undefined });
  };

  const selectErrors = () => {
    setFilter({ priorityMin: 0, priorityMax: 3 });
  };

  const currentMin = filter.priorityMin ?? 0;
  const currentMax = filter.priorityMax ?? 7;

  const isRangeStart = (priority: number) => priority === currentMin;
  const isRangeEnd = (priority: number) => priority === currentMax;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-theme">
          Priority Range
        </label>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className="accent-theme hover:opacity-80 transition-opacity"
          >
            All
          </button>
          <button
            onClick={selectErrors}
            className="accent-theme hover:opacity-80 transition-opacity"
          >
            Errors
          </button>
        </div>
      </div>
      <div className="inline-flex flex-shrink-0">
        {PRIORITIES.map((priority) => {
          const selected = isSelected(priority);
          const isStart = isRangeStart(priority);
          const isEnd = isRangeEnd(priority);

          return (
            <button
              key={priority}
              onClick={() => handleToggle(priority)}
              className={clsx(
                'px-1.5 py-1 text-xs font-medium border-y border-r first:border-l transition-colors',
                'first:rounded-l last:rounded-r',
                selected && isStart && 'rounded-l',
                selected && isEnd && 'rounded-r',
                selected
                  ? [PRIORITY_CSS_CLASSES[priority], 'border-current']
                  : 'bg-theme-secondary text-theme-secondary border-theme'
              )}
              title={`${PRIORITY_LABELS[priority]} (${priority})`}
            >
              {SHORT_LABELS[priority]}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-theme-secondary">
        Click to adjust range bounds
      </p>
    </div>
  );
}
