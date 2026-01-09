import { useState, useEffect, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { PRIORITY_LABELS, PRIORITY_SLIDER_COLORS } from '../../lib/types';
import clsx from 'clsx';

export function PriorityFilter() {
  const { filter, setFilter } = useFilterStore();

  // Derive min/max from current filter priorities
  const { initialMin, initialMax } = useMemo(() => {
    const priorities = filter.priorities ?? [];
    if (priorities.length === 0) {
      return { initialMin: 0, initialMax: 7 };
    }
    return {
      initialMin: Math.min(...priorities),
      initialMax: Math.max(...priorities),
    };
  }, [filter.priorities]);

  const [minPriority, setMinPriority] = useState(initialMin);
  const [maxPriority, setMaxPriority] = useState(initialMax);

  // Sync local state when filter changes externally
  useEffect(() => {
    setMinPriority(initialMin);
    setMaxPriority(initialMax);
  }, [initialMin, initialMax]);

  const updateFilter = (min: number, max: number) => {
    if (min === 0 && max === 7) {
      setFilter({ priorities: undefined });
    } else {
      const priorities = Array.from(
        { length: max - min + 1 },
        (_, i) => min + i
      );
      setFilter({ priorities });
    }
  };

  const handleMinChange = (value: number) => {
    const newMin = Math.min(value, maxPriority);
    setMinPriority(newMin);
    updateFilter(newMin, maxPriority);
  };

  const handleMaxChange = (value: number) => {
    const newMax = Math.max(value, minPriority);
    setMaxPriority(newMax);
    updateFilter(minPriority, newMax);
  };

  const selectAll = () => {
    setMinPriority(0);
    setMaxPriority(7);
    setFilter({ priorities: undefined });
  };

  const selectErrors = () => {
    setMinPriority(0);
    setMaxPriority(3);
    setFilter({ priorities: [0, 1, 2, 3] });
  };

  const isAllSelected = minPriority === 0 && maxPriority === 7;

  // Get range label
  const rangeLabel = isAllSelected
    ? 'All priorities'
    : minPriority === maxPriority
      ? PRIORITY_LABELS[minPriority]
      : `${PRIORITY_LABELS[minPriority]} - ${PRIORITY_LABELS[maxPriority]}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-theme">
          Priority Range
        </label>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className={clsx(
              'px-2 py-0.5 rounded transition-colors',
              isAllSelected
                ? 'bg-theme-secondary text-theme'
                : 'accent-theme hover:opacity-80'
            )}
          >
            All
          </button>
          <button
            onClick={selectErrors}
            className={clsx(
              'px-2 py-0.5 rounded transition-colors',
              minPriority === 0 && maxPriority === 3
                ? 'bg-theme-secondary text-theme'
                : 'accent-theme hover:opacity-80'
            )}
          >
            Errors
          </button>
        </div>
      </div>

      {/* Range slider track with color segments */}
      <div className="relative pt-1">
        {/* Background track with priority colors */}
        <div className="flex h-2 rounded-full overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
            <div
              key={p}
              className={clsx(
                'flex-1 transition-opacity',
                PRIORITY_SLIDER_COLORS[p],
                p >= minPriority && p <= maxPriority ? 'opacity-100' : 'opacity-20'
              )}
            />
          ))}
        </div>

        {/* Dual range inputs overlaid */}
        <div className="relative mt-1">
          <input
            type="range"
            min={0}
            max={7}
            value={minPriority}
            onChange={(e) => handleMinChange(parseInt(e.target.value))}
            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none
              [&::-webkit-slider-thumb]:pointer-events-auto
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-gray-400
              [&::-webkit-slider-thumb]:shadow
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:border-gray-600
              [&::-moz-range-thumb]:pointer-events-auto
              [&::-moz-range-thumb]:appearance-none
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-gray-400
              [&::-moz-range-thumb]:shadow
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:hover:border-gray-600"
            style={{ zIndex: minPriority > 5 ? 5 : 3 }}
          />
          <input
            type="range"
            min={0}
            max={7}
            value={maxPriority}
            onChange={(e) => handleMaxChange(parseInt(e.target.value))}
            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none
              [&::-webkit-slider-thumb]:pointer-events-auto
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-gray-400
              [&::-webkit-slider-thumb]:shadow
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:hover:border-gray-600
              [&::-moz-range-thumb]:pointer-events-auto
              [&::-moz-range-thumb]:appearance-none
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-gray-400
              [&::-moz-range-thumb]:shadow
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:hover:border-gray-600"
            style={{ zIndex: 4 }}
          />
        </div>

        {/* Priority labels below */}
        <div className="flex justify-between mt-1 text-[10px] text-theme-secondary">
          <span>emerg</span>
          <span>debug</span>
        </div>
      </div>

      {/* Current selection display */}
      <p className="text-xs text-theme-secondary text-center">
        Showing: <span className="text-theme font-medium">{rangeLabel}</span>
      </p>
    </div>
  );
}
