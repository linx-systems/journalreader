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

  // If no priorities set, all are selected (empty array means all)
  const selectedPriorities = filter.priorities ?? [];
  const allSelected = selectedPriorities.length === 0;

  const isSelected = (priority: number) => {
    return allSelected || selectedPriorities.includes(priority);
  };

  const handleToggle = (priority: number) => {
    if (allSelected) {
      // If all are selected, deselect this one (select all others)
      const newPriorities = PRIORITIES.filter(p => p !== priority);
      setFilter({ priorities: [...newPriorities] });
    } else if (isSelected(priority)) {
      // Deselect this priority
      const newPriorities = selectedPriorities.filter(p => p !== priority);
      // If none would be selected, select all (empty array)
      if (newPriorities.length === 0) {
        setFilter({ priorities: undefined });
      } else {
        setFilter({ priorities: newPriorities });
      }
    } else {
      // Select this priority
      const newPriorities = [...selectedPriorities, priority].sort((a, b) => a - b);
      // If all would be selected, use empty array
      if (newPriorities.length === 8) {
        setFilter({ priorities: undefined });
      } else {
        setFilter({ priorities: newPriorities });
      }
    }
  };

  const selectAll = () => {
    setFilter({ priorities: undefined });
  };

  const selectErrors = () => {
    setFilter({ priorities: [0, 1, 2, 3] });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-theme">
          Priority
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
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {PRIORITIES.slice(0, 4).map((priority) => {
            const selected = isSelected(priority);

            return (
              <button
                key={priority}
                onClick={() => handleToggle(priority)}
                className={clsx(
                  'flex-1 py-1 text-xs font-medium rounded transition-colors',
                  selected
                    ? [PRIORITY_CSS_CLASSES[priority], 'ring-1 ring-current']
                    : 'bg-theme-secondary text-theme-secondary'
                )}
                title={`${PRIORITY_LABELS[priority]} (${priority})`}
              >
                {SHORT_LABELS[priority]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          {PRIORITIES.slice(4).map((priority) => {
            const selected = isSelected(priority);

            return (
              <button
                key={priority}
                onClick={() => handleToggle(priority)}
                className={clsx(
                  'flex-1 py-1 text-xs font-medium rounded transition-colors',
                  selected
                    ? [PRIORITY_CSS_CLASSES[priority], 'ring-1 ring-current']
                    : 'bg-theme-secondary text-theme-secondary'
                )}
                title={`${PRIORITY_LABELS[priority]} (${priority}}`}
              >
                {SHORT_LABELS[priority]}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-theme-secondary">
        Click to toggle each priority
      </p>
    </div>
  );
}
