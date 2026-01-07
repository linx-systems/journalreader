import { useState, useMemo } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import { useUnits } from '../../hooks/useUnits';
import { Server, X, ChevronDown, Plus, Minus } from 'lucide-react';
import clsx from 'clsx';

type SelectionMode = 'include' | 'exclude';

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function UnitSelector() {
  const { filter, setFilter } = useFilterStore();
  const { units, isLoading } = useUnits();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<SelectionMode>('include');

  const filteredUnits = useMemo(() => {
    let result = units;
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter((unit) => unit.name.toLowerCase().includes(lowerSearch));
    }
    // Filter out already selected/excluded units from the dropdown
    return result.filter(
      (unit) => !filter.units.includes(unit.name) && !filter.excludedUnits.includes(unit.name)
    );
  }, [units, search, filter.units, filter.excludedUnits]);

  const handleSelect = (unitName: string) => {
    if (mode === 'include') {
      setFilter({ units: [...filter.units, unitName] });
    } else {
      setFilter({ excludedUnits: [...filter.excludedUnits, unitName] });
    }
  };

  const handleClearIncluded = () => {
    setFilter({ units: [] });
  };

  const handleClearExcluded = () => {
    setFilter({ excludedUnits: [] });
  };

  const removeIncludedUnit = (unitName: string) => {
    setFilter({ units: filter.units.filter((u) => u !== unitName) });
  };

  const removeExcludedUnit = (unitName: string) => {
    setFilter({ excludedUnits: filter.excludedUnits.filter((u) => u !== unitName) });
  };

  const getDropdownLabel = () => {
    if (filter.units.length === 0 && filter.excludedUnits.length === 0) {
      return 'All units';
    }
    const parts = [];
    if (filter.units.length > 0) {
      parts.push(`${filter.units.length} included`);
    }
    if (filter.excludedUnits.length > 0) {
      parts.push(`${filter.excludedUnits.length} excluded`);
    }
    return parts.join(', ');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-theme-secondary" />
        <label className="block text-sm font-medium text-theme">Units</label>
      </div>

      {/* Included units */}
      {filter.units.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-secondary flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Included
            </span>
            <button
              onClick={handleClearIncluded}
              className="text-xs text-theme-secondary hover:text-theme transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {filter.units.map((unit) => (
              <span
                key={unit}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                           bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded"
              >
                {unit}
                <button onClick={() => removeIncludedUnit(unit)} className="hover:opacity-80">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Excluded units */}
      {filter.excludedUnits.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-secondary flex items-center gap-1">
              <Minus className="h-3 w-3" />
              Excluded
            </span>
            <button
              onClick={handleClearExcluded}
              className="text-xs text-theme-secondary hover:text-theme transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {filter.excludedUnits.map((unit) => (
              <span
                key={unit}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                           bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded"
              >
                {unit}
                <button onClick={() => removeExcludedUnit(unit)} className="hover:opacity-80">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 border border-theme
                     rounded-lg bg-theme text-theme text-sm"
        >
          <span className="text-theme-secondary">{getDropdownLabel()}</span>
          <ChevronDown className={clsx('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div
            className="absolute z-10 w-full mt-1 bg-theme border border-theme
                          rounded-lg shadow-lg max-h-72 overflow-hidden"
          >
            {/* Mode toggle */}
            <div className="p-2 border-b border-theme flex gap-1">
              <button
                onClick={() => setMode('include')}
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                  mode === 'include'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'text-theme-secondary hover:bg-theme-secondary'
                )}
              >
                <Plus className="h-3 w-3" />
                Include
              </button>
              <button
                onClick={() => setMode('exclude')}
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                  mode === 'exclude'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'text-theme-secondary hover:bg-theme-secondary'
                )}
              >
                <Minus className="h-3 w-3" />
                Exclude
              </button>
            </div>

            {/* Search */}
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

            {/* Unit list */}
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
                      mode === 'include' && 'hover:bg-green-50 dark:hover:bg-green-900/20',
                      mode === 'exclude' && 'hover:bg-red-50 dark:hover:bg-red-900/20'
                    )}
                  >
                    <span className="font-mono text-xs">
                      <HighlightedText text={unit.name} highlight={search} />
                    </span>
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
