import { useFilterStore } from '../../stores/filterStore';
import { TIME_PRESETS } from '../../lib/types';
import { Clock } from 'lucide-react';
import clsx from 'clsx';

export function TimeRangePicker() {
  const { filter, setFilter } = useFilterStore();

  const handlePresetClick = (preset: typeof TIME_PRESETS[number]) => {
    if (preset.label === 'This boot') {
      setFilter({
        since: undefined,
        until: undefined,
        bootOffset: 0
      });
    } else {
      setFilter({
        since: preset.value,
        until: undefined,
        bootOffset: undefined,
        bootId: undefined
      });
    }
  };

  const isPresetSelected = (preset: typeof TIME_PRESETS[number]) => {
    if (preset.label === 'This boot') {
      return filter.bootOffset === 0 && !filter.since;
    }
    return filter.since === preset.value && !filter.bootOffset;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-theme-secondary" />
        <label className="block text-sm font-medium text-theme">
          Time Range
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset)}
            className={clsx(
              'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
              isPresetSelected(preset)
                ? 'selection-theme accent-theme border-current'
                : 'bg-theme text-theme-secondary border-theme hover:bg-theme-secondary'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
