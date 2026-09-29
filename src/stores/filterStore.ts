import { create } from 'zustand';
import type { JournalFilter, JournalEntry } from '../lib/types';
import { DEFAULT_FILTER } from '../lib/types';

interface FilterState {
  filter: JournalFilter;
  entries: JournalEntry[];
  resultGeneration: number;
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
  resultGeneration: 0,
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

  setEntries: (entries) => set((state) => ({
    entries,
    resultGeneration: state.resultGeneration + 1,
  })),

  appendEntries: (newEntries) =>
    set((state) => {
      const cursors = new Set(state.entries.map((entry) => entry.cursor));
      const accepted = newEntries.filter((entry) => {
        if (cursors.has(entry.cursor)) return false;
        cursors.add(entry.cursor);
        return true;
      });

      return accepted.length > 0
        ? { entries: [...state.entries, ...accepted] }
        : state;
    }),

  // Add new entries for follow mode - respects sort order
  // For newest-first (reverse: true): prepend entries (new at top)
  // For oldest-first (reverse: false): append entries (new at bottom)
  // Deduplicate by cursor and filter by current priority settings
  prependEntries: (newEntries) =>
    set((state) => {
      const acceptedCursors = new Set(state.entries.map((entry) => entry.cursor));
      const validPriorities = state.filter.priorities?.length
        ? new Set(state.filter.priorities)
        : null;
      const accepted = newEntries.filter((entry) => {
        if (acceptedCursors.has(entry.cursor)) return false;
        if (validPriorities && !validPriorities.has(entry.priority)) return false;
        acceptedCursors.add(entry.cursor);
        return true;
      });

      if (accepted.length === 0) return state;

      if (state.filter.reverse !== false) {
        return {
          entries: [...accepted.reverse(), ...state.entries],
        };
      }

      return {
        entries: [...state.entries, ...accepted],
      };
    }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setHasMore: (hasMore) => set({ hasMore }),

  setCursorEnd: (cursorEnd) => set({ cursorEnd }),

  setFollowing: (isFollowing) => set({ isFollowing }),

  setFollowPaused: (isFollowPaused) => set({ isFollowPaused }),
}));
