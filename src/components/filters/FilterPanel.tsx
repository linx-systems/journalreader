import { SearchBar } from './SearchBar';
import { PriorityFilter } from './PriorityFilter';
import { TimeRangePicker } from './TimeRangePicker';
import { UnitSelector } from './UnitSelector';
import { useFilterStore } from '../../stores/filterStore';
import { RotateCcw } from 'lucide-react';

export function FilterPanel() {
  const { resetFilter } = useFilterStore();

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h2>
        <button
          onClick={resetFilter}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                     hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          title="Reset filters"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <SearchBar />
        <TimeRangePicker />
        <PriorityFilter />
        <UnitSelector />
      </div>
    </div>
  );
}
