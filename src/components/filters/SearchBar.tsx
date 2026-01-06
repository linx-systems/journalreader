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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Search
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search messages (regex supported)"
          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                     placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        {localValue && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={toggleCaseSensitive}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        >
          {filter.caseSensitive ? (
            <ToggleRight className="h-4 w-4 text-sky-500" />
          ) : (
            <ToggleLeft className="h-4 w-4" />
          )}
          <span>Case sensitive</span>
        </button>
      </div>
    </div>
  );
}
