import { useState, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useUnits } from '../../hooks/useUnits';
import { Server, X, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export function UnitSelector() {
  const { filter, setFilter } = useFilterStore();
  const { units, isLoading } = useUnits();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredUnits = useMemo(() => {
    if (!search) return units;
    const lowerSearch = search.toLowerCase();
    return units.filter((unit) => unit.name.toLowerCase().includes(lowerSearch));
  }, [units, search]);

  const handleSelect = (unitName: string) => {
    const newUnits = filter.units.includes(unitName)
      ? filter.units.filter((u) => u !== unitName)
      : [...filter.units, unitName];
    setFilter({ units: newUnits });
  };

  const handleClear = () => {
    setFilter({ units: [] });
  };

  const removeUnit = (unitName: string) => {
    setFilter({ units: filter.units.filter((u) => u !== unitName) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-gray-500" />
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Units
        </label>
        {filter.units.length > 0 && (
          <button
            onClick={handleClear}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected units */}
      {filter.units.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filter.units.map((unit) => (
            <span
              key={unit}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                         bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 rounded"
            >
              {unit}
              <button onClick={() => removeUnit(unit)} className="hover:text-sky-900 dark:hover:text-sky-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 border border-gray-300
                     dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800
                     text-gray-900 dark:text-gray-100 text-sm"
        >
          <span className="text-gray-500 dark:text-gray-400">
            {filter.units.length === 0 ? 'All units' : `${filter.units.length} selected`}
          </span>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300
                          dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-hidden">
            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search units..."
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600
                           rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {isLoading ? (
                <div className="p-3 text-sm text-gray-500 text-center">Loading units...</div>
              ) : filteredUnits.length === 0 ? (
                <div className="p-3 text-sm text-gray-500 text-center">No units found</div>
              ) : (
                filteredUnits.map((unit) => (
                  <button
                    key={unit.name}
                    onClick={() => handleSelect(unit.name)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
                      filter.units.includes(unit.name) && 'bg-sky-50 dark:bg-sky-900/20'
                    )}
                  >
                    <span className="font-mono text-xs">{unit.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
