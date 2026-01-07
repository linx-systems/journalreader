import clsx from 'clsx';
import { useStatisticsStore } from '../../stores/statisticsStore';
import type { TimeGranularity } from '../../lib/types';

const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '10min', label: '10 min' },
  { value: '1hour', label: '1 hour' },
  { value: '6hour', label: '6 hours' },
  { value: '1day', label: '1 day' },
  { value: '1week', label: '1 week' },
];

export function GranularitySelector() {
  const { granularity, setGranularity } = useStatisticsStore();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-theme-secondary">Granularity:</span>
      <div className="flex gap-1">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setGranularity(opt.value)}
            className={clsx(
              'px-2 py-1 text-xs rounded transition-colors',
              granularity === opt.value
                ? 'bg-accent/20 text-accent ring-1 ring-accent/50'
                : 'bg-theme-secondary text-theme-secondary hover:text-theme'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
