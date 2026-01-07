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
    set((state) => ({
      filter: { ...state.filter, ...newFilter },
      // Reset pagination when filter changes
      entries: [],
      cursorEnd: null,
      hasMore: false,
    })),

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
  prependEntries: (newEntries) =>
    set((state) => ({
      entries: [...newEntries, ...state.entries],
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setHasMore: (hasMore) => set({ hasMore }),

  setCursorEnd: (cursorEnd) => set({ cursorEnd }),

  setFollowing: (isFollowing) => set({ isFollowing }),

  setFollowPaused: (isFollowPaused) => set({ isFollowPaused }),
}));
