import { useState } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { TIME_PRESETS } from '../../lib/types';
import { Clock, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';

export function TimeRangePicker() {
  const { filter, setFilter } = useFilterStore();
  const [showCustom, setShowCustom] = useState(false);
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');

  const handlePresetClick = (preset: typeof TIME_PRESETS[number]) => {
    setFilter({
      since: preset.value,
      until: undefined,
      bootOffset: undefined,
      bootId: undefined
    });
    setShowCustom(false);
  };

  const isPresetSelected = (preset: typeof TIME_PRESETS[number]) => {
    return filter.since === preset.value && filter.bootOffset === undefined && !filter.until;
  };

  const isCustomSelected = () => {
    return filter.until !== undefined ||
      (filter.since !== undefined &&
       !TIME_PRESETS.some(p => p.value === filter.since) &&
       filter.bootOffset === undefined);
  };

  const handleCustomApply = () => {
    const updates: { since?: string; until?: string; bootOffset?: undefined; bootId?: undefined } = {
      bootOffset: undefined,
      bootId: undefined
    };

    if (customSince) {
      updates.since = customSince;
    }
    if (customUntil) {
      updates.until = customUntil;
    }

    if (customSince || customUntil) {
      setFilter(updates);
    }
  };

  const handleCustomClear = () => {
    setCustomSince('');
    setCustomUntil('');
    setFilter({
      since: '15 minutes ago',
      until: undefined,
      bootOffset: undefined,
      bootId: undefined
    });
  };

  const formatDateTimeLocal = (date: Date) => {
    return format(date, "yyyy-MM-dd'T'HH:mm");
  };

  const getDefaultSince = () => {
    const date = new Date();
    date.setHours(date.getHours() - 1);
    return formatDateTimeLocal(date);
  };

  const getDefaultUntil = () => {
    return formatDateTimeLocal(new Date());
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-theme-secondary" />
        <label className="block text-sm font-medium text-theme">
          Time Range
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {TIME_PRESETS.slice(0, 3).map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={clsx(
                'flex-1 py-1 text-xs font-medium rounded transition-colors',
                isPresetSelected(preset)
                  ? 'selection-theme accent-theme ring-1 ring-current'
                  : 'bg-theme-secondary text-theme-secondary'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TIME_PRESETS.slice(3).map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={clsx(
                'flex-1 py-1 text-xs font-medium rounded transition-colors',
                isPresetSelected(preset)
                  ? 'selection-theme accent-theme ring-1 ring-current'
                  : 'bg-theme-secondary text-theme-secondary'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom range toggle */}
        <button
          onClick={() => {
            setShowCustom(!showCustom);
            if (!showCustom && !customSince && !customUntil) {
              setCustomSince(getDefaultSince());
              setCustomUntil(getDefaultUntil());
            }
          }}
          className={clsx(
            'w-full flex items-center justify-center gap-1 py-1 text-xs font-medium rounded transition-colors',
            isCustomSelected()
              ? 'selection-theme accent-theme ring-1 ring-current'
              : 'bg-theme-secondary text-theme-secondary'
          )}
        >
          <Calendar className="h-3 w-3" />
          Custom
          {showCustom ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Custom date/time inputs */}
      {showCustom && (
        <div className="space-y-2 p-2 bg-theme-secondary rounded-lg">
          <div>
            <label className="block text-xs text-theme-secondary mb-1">From</label>
            <input
              type="datetime-local"
              value={customSince}
              onChange={(e) => setCustomSince(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-theme rounded
                         bg-theme text-theme"
            />
          </div>
          <div>
            <label className="block text-xs text-theme-secondary mb-1">To</label>
            <input
              type="datetime-local"
              value={customUntil}
              onChange={(e) => setCustomUntil(e.target.value)}
              className="w-full px-2 py-1 text-xs border border-theme rounded
                         bg-theme text-theme"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCustomApply}
              className="flex-1 py-1 text-xs font-medium rounded
                         selection-theme accent-theme transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleCustomClear}
              className="flex-1 py-1 text-xs font-medium rounded
                         bg-theme text-theme-secondary hover:text-theme transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
