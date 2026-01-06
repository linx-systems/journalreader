import { useFilterStore } from '../../stores/filterStore';
import { PRIORITY_LABELS, PRIORITY_BG_COLORS, PRIORITY_COLORS } from '../../lib/types';
import clsx from 'clsx';

const PRIORITIES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Priority
        </label>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            All
          </button>
          <button
            onClick={selectErrors}
            className="text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            Errors
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {PRIORITIES.map((priority) => (
          <button
            key={priority}
            onClick={() => handleToggle(priority)}
            className={clsx(
              'px-2 py-1 text-xs font-medium rounded border transition-colors',
              isSelected(priority)
                ? [PRIORITY_BG_COLORS[priority], PRIORITY_COLORS[priority], 'border-current']
                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-600'
            )}
          >
            {PRIORITY_LABELS[priority]}
          </button>
        ))}
      </div>
    </div>
  );
}
