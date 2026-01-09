import { create } from 'zustand';
import type { JournalEntry } from '../lib/types';

/**
 * State for a single split panel's log entries
 */
interface PanelState {
  entries: JournalEntry[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  cursorEnd: string | null;
}

/**
 * Default panel state
 */
const defaultPanelState: PanelState = {
  entries: [],
  isLoading: false,
  error: null,
  hasMore: false,
  cursorEnd: null,
};

/**
 * Store for managing independent log entries per split panel.
 * Each panel (left/right in split view) maintains its own entries
 * so that swapping panels correctly displays different host logs.
 */
interface SplitPanelStore {
  /** State for left/top panel */
  leftPanel: PanelState;
  /** State for right/bottom panel */
  rightPanel: PanelState;

  // Left panel actions
  setLeftEntries: (entries: JournalEntry[]) => void;
  appendLeftEntries: (entries: JournalEntry[]) => void;
  prependLeftEntries: (entries: JournalEntry[], reverse?: boolean) => void;
  setLeftLoading: (loading: boolean) => void;
  setLeftError: (error: string | null) => void;
  setLeftHasMore: (hasMore: boolean) => void;
  setLeftCursorEnd: (cursor: string | null) => void;
  clearLeftPanel: () => void;

  // Right panel actions
  setRightEntries: (entries: JournalEntry[]) => void;
  appendRightEntries: (entries: JournalEntry[]) => void;
  prependRightEntries: (entries: JournalEntry[], reverse?: boolean) => void;
  setRightLoading: (loading: boolean) => void;
  setRightError: (error: string | null) => void;
  setRightHasMore: (hasMore: boolean) => void;
  setRightCursorEnd: (cursor: string | null) => void;
  clearRightPanel: () => void;

  /** Clear both panels (when exiting split view) */
  clearAllPanels: () => void;
}

/**
 * Helper to deduplicate and prepend/append entries based on sort order
 */
function mergeEntries(
  existing: JournalEntry[],
  newEntries: JournalEntry[],
  isNewestFirst: boolean
): JournalEntry[] {
  const existingCursors = new Set(existing.map(e => e.cursor));
  const uniqueNew = newEntries.filter(e => !existingCursors.has(e.cursor));

  if (uniqueNew.length === 0) return existing;

  return isNewestFirst
    ? [...uniqueNew, ...existing]
    : [...existing, ...uniqueNew];
}

export const useSplitPanelStore = create<SplitPanelStore>((set) => ({
  leftPanel: { ...defaultPanelState },
  rightPanel: { ...defaultPanelState },

  // Left panel actions
  setLeftEntries: (entries) => set((state) => ({
    leftPanel: { ...state.leftPanel, entries },
  })),

  appendLeftEntries: (newEntries) => set((state) => ({
    leftPanel: {
      ...state.leftPanel,
      entries: [...state.leftPanel.entries, ...newEntries],
    },
  })),

  prependLeftEntries: (newEntries, reverse = true) => set((state) => ({
    leftPanel: {
      ...state.leftPanel,
      entries: mergeEntries(state.leftPanel.entries, newEntries, reverse),
    },
  })),

  setLeftLoading: (isLoading) => set((state) => ({
    leftPanel: { ...state.leftPanel, isLoading },
  })),

  setLeftError: (error) => set((state) => ({
    leftPanel: { ...state.leftPanel, error },
  })),

  setLeftHasMore: (hasMore) => set((state) => ({
    leftPanel: { ...state.leftPanel, hasMore },
  })),

  setLeftCursorEnd: (cursorEnd) => set((state) => ({
    leftPanel: { ...state.leftPanel, cursorEnd },
  })),

  clearLeftPanel: () => set((state) => ({
    leftPanel: { ...defaultPanelState },
  })),

  // Right panel actions
  setRightEntries: (entries) => set((state) => ({
    rightPanel: { ...state.rightPanel, entries },
  })),

  appendRightEntries: (newEntries) => set((state) => ({
    rightPanel: {
      ...state.rightPanel,
      entries: [...state.rightPanel.entries, ...newEntries],
    },
  })),

  prependRightEntries: (newEntries, reverse = true) => set((state) => ({
    rightPanel: {
      ...state.rightPanel,
      entries: mergeEntries(state.rightPanel.entries, newEntries, reverse),
    },
  })),

  setRightLoading: (isLoading) => set((state) => ({
    rightPanel: { ...state.rightPanel, isLoading },
  })),

  setRightError: (error) => set((state) => ({
    rightPanel: { ...state.rightPanel, error },
  })),

  setRightHasMore: (hasMore) => set((state) => ({
    rightPanel: { ...state.rightPanel, hasMore },
  })),

  setRightCursorEnd: (cursorEnd) => set((state) => ({
    rightPanel: { ...state.rightPanel, cursorEnd },
  })),

  clearRightPanel: () => set((state) => ({
    rightPanel: { ...defaultPanelState },
  })),

  // Clear all
  clearAllPanels: () => set({
    leftPanel: { ...defaultPanelState },
    rightPanel: { ...defaultPanelState },
  }),
}));
