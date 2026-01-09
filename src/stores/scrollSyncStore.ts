import { create } from 'zustand';

/**
 * Store for synchronized time-based scrolling between multiple log panels.
 * When sync is enabled, scrolling one panel broadcasts its anchor timestamp
 * so other panels can scroll to the same point in time.
 */
interface ScrollSyncStore {
  /** Whether scroll sync is enabled across panels */
  syncEnabled: boolean;

  /** The timestamp that all panels should sync to (microseconds since epoch) */
  anchorTimestamp: number | null;

  /**
   * Source panel that triggered the sync (to avoid echo loops).
   * Set to the tab ID of the panel that initiated the scroll.
   */
  sourceTabId: string | null;

  /**
   * Debounce counter for scroll events.
   * Incremented each time a sync is triggered to help consumers
   * know when a new sync event occurred.
   */
  syncVersion: number;

  // Actions

  /** Enable or disable scroll sync */
  setSyncEnabled: (enabled: boolean) => void;

  /**
   * Broadcast a new anchor timestamp from a specific source panel.
   * Other panels should scroll to this timestamp.
   * @param timestamp - Timestamp in microseconds since epoch
   * @param sourceTabId - Tab ID of the panel that triggered the sync
   */
  broadcastTimestamp: (timestamp: number, sourceTabId: string) => void;

  /** Clear the anchor timestamp (e.g., when panels are removed) */
  clearAnchor: () => void;
}

export const useScrollSyncStore = create<ScrollSyncStore>((set) => ({
  syncEnabled: false,
  anchorTimestamp: null,
  sourceTabId: null,
  syncVersion: 0,

  setSyncEnabled: (enabled) => set({
    syncEnabled: enabled,
    // Clear anchor when disabling to avoid stale state
    anchorTimestamp: enabled ? null : null,
    sourceTabId: enabled ? null : null,
  }),

  broadcastTimestamp: (timestamp, sourceTabId) => set((state) => ({
    anchorTimestamp: timestamp,
    sourceTabId,
    syncVersion: state.syncVersion + 1,
  })),

  clearAnchor: () => set({
    anchorTimestamp: null,
    sourceTabId: null,
  }),
}));
