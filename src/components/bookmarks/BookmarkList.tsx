import { useState } from 'react';
import {
  Bookmark as BookmarkIcon,
  Trash2,
  Edit2,
  MoreVertical,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useBookmarkStore, type Bookmark } from '../../stores/bookmarkStore';
import { useFilterStore } from '../../stores/filterStore';
import { SaveFilterDialog } from './SaveFilterDialog';
import { DEFAULT_FILTER } from '../../lib/types';
import { ModalDialog } from '../ui/ModalDialog';

interface BookmarkItemProps {
  bookmark: Bookmark;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function BookmarkItem({
  bookmark,
  index,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: BookmarkItemProps) {
  const [showMenu, setShowMenu] = useState(false);

  const shortcutKey = index < 9 ? `Ctrl+${index + 1}` : null;

  return (
    <div
      className={`group relative flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
                  transition-colors ${
                    isActive
                      ? 'bg-accent/20 text-accent'
                      : 'hover:bg-theme-secondary text-theme'
                  }`}
      onClick={onSelect}
    >
      <BookmarkIcon
        className={`h-3.5 w-3.5 flex-shrink-0 ${
          isActive ? 'text-accent fill-accent/30' : 'text-theme-secondary'
        }`}
      />
      <span className="flex-1 truncate text-sm">{bookmark.name}</span>
      {shortcutKey && (
        <span className="text-xs text-theme-secondary opacity-0 group-hover:opacity-100 transition-opacity">
          {shortcutKey}
        </span>
      )}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-theme-secondary
                     rounded transition-all"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
            />
            <div
              className="absolute right-0 top-full mt-1 z-20 bg-theme border border-theme
                         rounded shadow-lg py-1 min-w-[120px]"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit();
                }}
                className="w-full px-3 py-1.5 text-sm text-left text-theme
                           hover:bg-theme-secondary flex items-center gap-2"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete();
                }}
                className="w-full px-3 py-1.5 text-sm text-left text-red-500
                           hover:bg-theme-secondary flex items-center gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface BookmarkListProps {
  onImport?: () => void;
  onExport?: () => void;
}

export function BookmarkList({ onImport, onExport }: BookmarkListProps) {
  const { bookmarks, activeBookmarkId, deleteBookmark, updateBookmark, setActiveBookmark, markAsUsed } =
    useBookmarkStore();
  const { setFilter } = useFilterStore();
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSelectBookmark = (bookmark: Bookmark) => {
    // Apply the bookmark's filters
    const filtersToApply = {
      ...DEFAULT_FILTER,
      ...bookmark.filters,
    };
    setFilter(filtersToApply);
    setActiveBookmark(bookmark.id);
    markAsUsed(bookmark.id);
  };

  const handleEditSave = (name: string, description?: string) => {
    if (editingBookmark) {
      updateBookmark(editingBookmark.id, { name, description });
      setEditingBookmark(null);
    }
  };

  const handleDeleteConfirm = (id: string) => {
    deleteBookmark(id);
    setShowDeleteConfirm(null);
  };

  const hasBookmarks = bookmarks.length > 0;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 text-sm font-medium text-theme-secondary
                   hover:text-theme transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <BookmarkIcon className="h-4 w-4" />
        <span>Saved Filters{hasBookmarks ? ` (${bookmarks.length})` : ''}</span>
      </button>

      {isExpanded && (
        <div className="space-y-1 pl-2">
          {hasBookmarks ? (
            bookmarks.map((bookmark, index) => (
              <BookmarkItem
                key={bookmark.id}
                bookmark={bookmark}
                index={index}
                isActive={activeBookmarkId === bookmark.id}
                onSelect={() => handleSelectBookmark(bookmark)}
                onEdit={() => setEditingBookmark(bookmark)}
                onDelete={() => setShowDeleteConfirm(bookmark.id)}
              />
            ))
          ) : (
            <p className="text-xs text-theme-secondary py-1">
              No saved filters yet. Click the star icon to save current filters.
            </p>
          )}

          {(onImport || (onExport && hasBookmarks)) && (
            <div className={`flex gap-2 ${hasBookmarks ? 'pt-2 border-t border-theme mt-2' : 'pt-1'}`}>
              {onImport && (
                <button
                  onClick={onImport}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-theme-secondary
                             hover:text-theme hover:bg-theme-secondary rounded transition-colors"
                >
                  <Upload className="h-3 w-3" />
                  Import
                </button>
              )}
              {onExport && hasBookmarks && (
                <button
                  onClick={onExport}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-theme-secondary
                             hover:text-theme hover:bg-theme-secondary rounded transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <SaveFilterDialog
        isOpen={!!editingBookmark}
        onClose={() => setEditingBookmark(null)}
        onSave={handleEditSave}
        initialName={editingBookmark?.name || ''}
        initialDescription={editingBookmark?.description || ''}
        title="Edit Bookmark"
      />

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ModalDialog
          isOpen
          onRequestClose={() => setShowDeleteConfirm(null)}
          labelledBy="delete-bookmark-dialog-title"
          closeOnBackdrop
        >
          <div className="bg-theme border border-theme rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
            <h3 id="delete-bookmark-dialog-title" className="font-semibold text-theme mb-2">Delete Bookmark?</h3>
            <p className="text-sm text-theme-secondary mb-4">
              Are you sure you want to delete this bookmark? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-theme-secondary hover:text-theme
                           hover:bg-theme-secondary rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(showDeleteConfirm)}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded
                           hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
