import { useState, useEffect } from 'react';
import { Search, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { useFilterStore } from '../../stores/filterStore';

export function SearchBar() {
  const { filter, setFilter } = useFilterStore();
  const [localValue, setLocalValue] = useState(filter.grepPattern ?? '');

  useEffect(() => {
    setLocalValue(filter.grepPattern ?? '');
  }, [filter.grepPattern]);

  const handleChange = (value: string) => {
    setLocalValue(value);
    setFilter({ grepPattern: value || undefined });
  };

  const handleClear = () => {
    setLocalValue('');
    setFilter({ grepPattern: undefined });
  };

  const toggleCaseSensitive = () => {
    setFilter({ caseSensitive: !filter.caseSensitive });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-theme">
        Search
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-theme-secondary" />
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search messages (regex supported)"
          className="w-full pl-10 pr-10 py-2 border border-theme rounded-lg
                     bg-theme text-theme
                     focus:ring-2 focus:outline-none
                     placeholder:text-theme-secondary"
          style={{
            '--tw-ring-color': 'var(--color-accent)',
          } as React.CSSProperties}
        />
        {localValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-secondary hover:text-theme transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={toggleCaseSensitive}
          className="flex items-center gap-2 text-theme-secondary hover:text-theme transition-colors"
        >
          {filter.caseSensitive ? (
            <ToggleRight className="h-4 w-4 accent-theme" />
          ) : (
            <ToggleLeft className="h-4 w-4" />
          )}
          <span>Case sensitive</span>
        </button>
      </div>
    </div>
  );
}
