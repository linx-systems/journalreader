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
        <Server className="h-4 w-4 text-theme-secondary" />
        <label className="block text-sm font-medium text-theme">
          Units
        </label>
        {filter.units.length > 0 && (
          <button
            onClick={handleClear}
            className="ml-auto text-xs text-theme-secondary hover:text-theme transition-colors"
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
                         selection-theme accent-theme rounded"
            >
              {unit}
              <button onClick={() => removeUnit(unit)} className="hover:opacity-80">
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
          className="w-full flex items-center justify-between px-3 py-2 border border-theme
                     rounded-lg bg-theme text-theme text-sm"
        >
          <span className="text-theme-secondary">
            {filter.units.length === 0 ? 'All units' : `${filter.units.length} selected`}
          </span>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-theme border border-theme
                          rounded-lg shadow-lg max-h-60 overflow-hidden">
            <div className="p-2 border-b border-theme">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search units..."
                className="w-full px-2 py-1 text-sm border border-theme
                           rounded bg-theme-secondary text-theme"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {isLoading ? (
                <div className="p-3 text-sm text-theme-secondary text-center">Loading units...</div>
              ) : filteredUnits.length === 0 ? (
                <div className="p-3 text-sm text-theme-secondary text-center">No units found</div>
              ) : (
                filteredUnits.map((unit) => (
                  <button
                    key={unit.name}
                    onClick={() => handleSelect(unit.name)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-theme-secondary transition-colors',
                      filter.units.includes(unit.name) && 'selection-theme'
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
