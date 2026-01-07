import { SearchBar } from './SearchBar';
import { PriorityFilter } from './PriorityFilter';
import { TimeRangePicker } from './TimeRangePicker';
import { BootSelector } from './BootSelector';
import { UnitSelector } from './UnitSelector';
import { useFilterStore } from '../../stores/filterStore';
import { RotateCcw } from 'lucide-react';

export function FilterPanel() {
  const { resetFilter } = useFilterStore();

  return (
    <div className="h-full flex flex-col bg-theme border-r border-theme">
      <div className="p-4 border-b border-theme flex items-center justify-between">
        <h2 className="font-semibold text-theme">Filters</h2>
        <button
          onClick={resetFilter}
          className="p-1.5 text-theme-secondary hover:text-theme
                     hover:bg-theme-secondary rounded transition-colors"
          title="Reset filters"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <SearchBar />
        <TimeRangePicker />
        <BootSelector />
        <PriorityFilter />
        <UnitSelector />
      </div>
    </div>
  );
}
