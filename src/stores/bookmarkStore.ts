import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JournalFilter } from '../lib/types';

const STORAGE_KEY = 'journal-reader-bookmarks';

export interface Bookmark {
  id: string;
  name: string;
  description?: string;
  filters: Partial<JournalFilter>;
  createdAt: number;
  lastUsed?: number;
}

interface BookmarkState {
  bookmarks: Bookmark[];
  activeBookmarkId: string | null;

  // Actions
  addBookmark: (name: string, filters: Partial<JournalFilter>, description?: string) => Bookmark;
  updateBookmark: (id: string, updates: Partial<Omit<Bookmark, 'id' | 'createdAt'>>) => void;
  deleteBookmark: (id: string) => void;
  setActiveBookmark: (id: string | null) => void;
  markAsUsed: (id: string) => void;
  getBookmarkByIndex: (index: number) => Bookmark | undefined;
  importBookmarks: (bookmarks: Bookmark[]) => void;
  exportBookmarks: () => Bookmark[];
}

function generateId(): string {
  return `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function validateBookmark(bookmark: unknown): bookmark is Bookmark {
  if (!bookmark || typeof bookmark !== 'object') return false;
  const b = bookmark as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.filters === 'object' &&
    b.filters !== null &&
    typeof b.createdAt === 'number'
  );
}

export const useBookmarkStore = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      activeBookmarkId: null,

      addBookmark: (name, filters, description) => {
        const bookmark: Bookmark = {
          id: generateId(),
          name,
          description,
          filters: { ...filters },
          createdAt: Date.now(),
        };

        set((state) => ({
          bookmarks: [...state.bookmarks, bookmark],
        }));

        return bookmark;
      },

      updateBookmark: (id, updates) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        }));
      },

      deleteBookmark: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
          activeBookmarkId: state.activeBookmarkId === id ? null : state.activeBookmarkId,
        }));
      },

      setActiveBookmark: (id) => {
        set({ activeBookmarkId: id });
      },

      markAsUsed: (id) => {
        set((state) => ({
          bookmarks: state.bookmarks.map((b) =>
            b.id === id ? { ...b, lastUsed: Date.now() } : b
          ),
        }));
      },

      getBookmarkByIndex: (index) => {
        const state = get();
        return state.bookmarks[index];
      },

      importBookmarks: (bookmarks) => {
        const validBookmarks = bookmarks.filter(validateBookmark).map((b) => ({
          ...b,
          id: generateId(), // Generate new IDs to avoid conflicts
        }));

        set((state) => ({
          bookmarks: [...state.bookmarks, ...validBookmarks],
        }));
      },

      exportBookmarks: () => {
        return get().bookmarks;
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        bookmarks: state.bookmarks,
      }),
    }
  )
);
