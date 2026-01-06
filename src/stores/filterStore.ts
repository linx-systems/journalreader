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

  // Actions
  setFilter: (filter: Partial<JournalFilter>) => void;
  resetFilter: () => void;
  setEntries: (entries: JournalEntry[]) => void;
  appendEntries: (entries: JournalEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursorEnd: (cursor: string | null) => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  filter: { ...DEFAULT_FILTER, since: '15 minutes ago' },
  entries: [],
  isLoading: false,
  error: null,
  hasMore: false,
  cursorEnd: null,

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

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setHasMore: (hasMore) => set({ hasMore }),

  setCursorEnd: (cursorEnd) => set({ cursorEnd }),
}));
