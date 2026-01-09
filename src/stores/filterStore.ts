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

  // Add new entries for follow mode - respects sort order
  // For newest-first (reverse: true): prepend entries (new at top)
  // For oldest-first (reverse: false): append entries (new at bottom)
  // Deduplicate by cursor and filter by current priority settings
  prependEntries: (newEntries) =>
    set((state) => {
      // Create a Set of existing cursors for O(1) lookup
      const existingCursors = new Set(state.entries.map(e => e.cursor));

      // Get valid priorities from current filter (if set)
      const validPriorities = state.filter.priorities?.length
        ? new Set(state.filter.priorities)
        : null;

      // Filter out entries that already exist OR don't match priority filter
      const uniqueNewEntries = newEntries.filter(e => {
        // Skip if already exists
        if (existingCursors.has(e.cursor)) return false;
        // Skip if doesn't match priority filter (when filter is active)
        if (validPriorities && !validPriorities.has(e.priority)) return false;
        return true;
      });

      if (uniqueNewEntries.length === 0) return state;

      // Check sort order: reverse=true means newest-first, reverse=false means oldest-first
      const isNewestFirst = state.filter.reverse !== false; // default to true if undefined

      if (isNewestFirst) {
        // Newest-first: prepend new entries (they appear at the top)
        return {
          entries: [...uniqueNewEntries, ...state.entries],
        };
      } else {
        // Oldest-first: append new entries (they appear at the bottom)
        return {
          entries: [...state.entries, ...uniqueNewEntries],
        };
      }
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setHasMore: (hasMore) => set({ hasMore }),

  setCursorEnd: (cursorEnd) => set({ cursorEnd }),

  setFollowing: (isFollowing) => set({ isFollowing }),

  setFollowPaused: (isFollowPaused) => set({ isFollowPaused }),
}));
