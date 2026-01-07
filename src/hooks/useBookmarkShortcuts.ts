import { useEffect } from 'react';
import { useBookmarkStore } from '../stores/bookmarkStore';
import { useFilterStore } from '../stores/filterStore';
import { DEFAULT_FILTER } from '../lib/types';

/**
 * Hook that enables keyboard shortcuts for quick-loading bookmarks.
 * Ctrl+1 through Ctrl+9 will load the corresponding bookmark.
 */
export function useBookmarkShortcuts() {
  const { bookmarks, setActiveBookmark, markAsUsed } = useBookmarkStore();
  const { setFilter } = useFilterStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Check for Ctrl+1 through Ctrl+9
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9) {
          const bookmarkIndex = num - 1;
          const bookmark = bookmarks[bookmarkIndex];

          if (bookmark) {
            e.preventDefault();

            // Apply the bookmark's filters
            const filtersToApply = {
              ...DEFAULT_FILTER,
              ...bookmark.filters,
            };
            setFilter(filtersToApply);
            setActiveBookmark(bookmark.id);
            markAsUsed(bookmark.id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookmarks, setFilter, setActiveBookmark, markAsUsed]);
}
