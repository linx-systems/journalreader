import { useState, useRef } from 'react';
import { SearchBar } from './SearchBar';
import { PriorityFilter } from './PriorityFilter';
import { TimeRangePicker } from './TimeRangePicker';
import { BootSelector } from './BootSelector';
import { UnitSelector } from './UnitSelector';
import { QuickFilters } from './QuickFilters';
import { useFilterStore } from '../../stores/filterStore';
import { useBookmarkStore } from '../../stores/bookmarkStore';
import { BookmarkList, SaveFilterDialog } from '../bookmarks';
import { RotateCcw, Star } from 'lucide-react';
import { logError } from '../../lib/errorLogger';

export function FilterPanel() {
  const { filter, resetFilter } = useFilterStore();
  const { addBookmark, importBookmarks, exportBookmarks, setActiveBookmark } = useBookmarkStore();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveBookmark = (name: string, description?: string) => {
    // Extract only the filter properties we want to save
    const { afterCursor, ...filtersToSave } = filter;
    addBookmark(name, filtersToSave, description);
  };

  const handleExport = () => {
    const bookmarks = exportBookmarks();
    const json = JSON.stringify(bookmarks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'journal-reader-bookmarks.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        importBookmarks(data);
      }
    } catch (err) {
      logError(err, { component: 'FilterPanel', action: 'importBookmarks' });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetFilter = () => {
    resetFilter();
    setActiveBookmark(null);
  };

  return (
    <div className="h-full flex flex-col bg-theme border-r border-theme">
      <div className="p-4 border-b border-theme flex items-center justify-between">
        <h2 className="font-semibold text-theme">Filters</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSaveDialog(true)}
            className="p-1.5 text-theme-secondary hover:text-accent
                       hover:bg-theme-secondary rounded transition-colors"
            title="Save current filter as bookmark"
          >
            <Star className="h-4 w-4" />
          </button>
          <button
            onClick={handleResetFilter}
            className="p-1.5 text-theme-secondary hover:text-theme
                       hover:bg-theme-secondary rounded transition-colors"
            title="Reset filters"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <QuickFilters />
        <BookmarkList onImport={handleImport} onExport={handleExport} />
        <SearchBar />
        <TimeRangePicker />
        <BootSelector />
        <PriorityFilter />
        <UnitSelector />
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Save dialog */}
      <SaveFilterDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSaveBookmark}
      />
    </div>
  );
}
