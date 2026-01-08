import { create } from 'zustand';
import type { JournalFilter, JournalEntry } from '../lib/types';
import { DEFAULT_FILTER } from '../lib/types';

interface FilterState {
  filter: JournalFilter;
  entries: JournalEntry[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  cursorEnd: string | null;

  // Follow mode state
  isFollowing: boolean;
  isFollowPaused: boolean;

  // Actions
  setFilter: (filter: Partial<JournalFilter>) => void;
  resetFilter: () => void;
  setEntries: (entries: JournalEntry[]) => void;
  appendEntries: (entries: JournalEntry[]) => void;
  prependEntries: (entries: JournalEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursorEnd: (cursor: string | null) => void;
  setFollowing: (following: boolean) => void;
  setFollowPaused: (paused: boolean) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filter: { ...DEFAULT_FILTER, since: '15 minutes ago' },
  entries: [],
  isLoading: false,
  error: null,
  hasMore: false,
  cursorEnd: null,
  isFollowing: false,
  isFollowPaused: false,

  setFilter: (newFilter) =>
    set((state) => {
      const updatedFilter = { ...state.filter, ...newFilter };

      // When in follow mode and priorities change, filter out entries that don't match
      let filteredEntries = state.entries;
      if (state.isFollowing && newFilter.priorities !== undefined) {
        const validPriorities = new Set(newFilter.priorities);
        // If priorities array is empty or undefined, keep all entries
        if (newFilter.priorities.length > 0) {
          filteredEntries = state.entries.filter(entry =>
            validPriorities.has(entry.priority)
          );
        }
      } else if (!state.isFollowing) {
        // Not in follow mode - clear entries as before
        filteredEntries = [];
      }

      return {
        filter: updatedFilter,
        entries: filteredEntries,
        cursorEnd: state.isFollowing ? state.cursorEnd : null,
        hasMore: state.isFollowing ? state.hasMore : false,
      };
    }),

  resetFilter: () =>
    set({
      filter: { ...DEFAULT_FILTER, since: '15 minutes ago' },
      entries: [],
      cursorEnd: null,
      hasMore: false,
      error: null,
    }),

  setEntries: (entries) => set({ entries }),

  appendEntries: (newEntries) =>
    set((state) => ({
      entries: [...state.entries, ...newEntries],
    })),

  // Add new entries at the beginning (for follow mode with newest-first display)
  // Deduplicate by cursor to prevent duplicate entries from overlapping
  prependEntries: (newEntries) =>
    set((state) => {
      // Create a Set of existing cursors for O(1) lookup
      const existingCursors = new Set(state.entries.map(e => e.cursor));
      // Filter out any entries that already exist
      const uniqueNewEntries = newEntries.filter(e => !existingCursors.has(e.cursor));
      if (uniqueNewEntries.length === 0) return state;
      return {
        entries: [...uniqueNewEntries, ...state.entries],
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setHasMore: (hasMore) => set({ hasMore }),

  setCursorEnd: (cursorEnd) => set({ cursorEnd }),

  setFollowing: (isFollowing) => set({ isFollowing }),

  setFollowPaused: (isFollowPaused) => set({ isFollowPaused }),
}));
