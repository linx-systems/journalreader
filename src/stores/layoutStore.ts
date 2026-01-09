import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * View layout types for the main content area
 */
export type ViewLayout = 'single' | 'split-vertical' | 'split-horizontal';

/**
 * Store for managing the split view layout state
 */
interface LayoutStore {
  /** Current layout mode */
  layout: ViewLayout;

  /** Ratio of the split (0.0 to 1.0, where 0.5 = equal split) */
  splitRatio: number;

  /** Host ID shown in the left/top panel (null = active tab) */
  leftPanelHostId: string | null;

  /** Host ID shown in the right/bottom panel */
  rightPanelHostId: string | null;

  /** Minimum panel size as percentage */
  minPanelSize: number;

  // Actions

  /** Set the layout mode */
  setLayout: (layout: ViewLayout) => void;

  /** Set the split ratio (0.0 to 1.0) */
  setSplitRatio: (ratio: number) => void;

  /** Reset split ratio to 50/50 */
  resetSplitRatio: () => void;

  /** Set the left/top panel host */
  setLeftPanelHost: (hostId: string | null) => void;

  /** Set the right/bottom panel host */
  setRightPanelHost: (hostId: string | null) => void;

  /** Swap the panel contents */
  swapPanels: () => void;

  /** Enter split view with specified hosts */
  enterSplitView: (layout: 'split-vertical' | 'split-horizontal', leftHostId: string, rightHostId: string) => void;

  /** Exit split view and return to single panel */
  exitSplitView: () => void;
}

const DEFAULT_SPLIT_RATIO = 0.5;
const MIN_PANEL_SIZE = 0.2; // 20% minimum

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      layout: 'single',
      splitRatio: DEFAULT_SPLIT_RATIO,
      leftPanelHostId: null,
      rightPanelHostId: null,
      minPanelSize: MIN_PANEL_SIZE,

      setLayout: (layout) => set({ layout }),

      setSplitRatio: (ratio) => {
        // Clamp ratio within min/max bounds
        const clampedRatio = Math.max(MIN_PANEL_SIZE, Math.min(1 - MIN_PANEL_SIZE, ratio));
        set({ splitRatio: clampedRatio });
      },

      resetSplitRatio: () => set({ splitRatio: DEFAULT_SPLIT_RATIO }),

      setLeftPanelHost: (hostId) => set({ leftPanelHostId: hostId }),

      setRightPanelHost: (hostId) => set({ rightPanelHostId: hostId }),

      swapPanels: () => set((state) => ({
        leftPanelHostId: state.rightPanelHostId,
        rightPanelHostId: state.leftPanelHostId,
      })),

      enterSplitView: (layout, leftHostId, rightHostId) => set({
        layout,
        leftPanelHostId: leftHostId,
        rightPanelHostId: rightHostId,
      }),

      exitSplitView: () => set({
        layout: 'single',
        leftPanelHostId: null,
        rightPanelHostId: null,
      }),
    }),
    {
      name: 'journal-reader-layout',
      partialize: (state) => ({
        // Persist layout preferences
        layout: state.layout,
        splitRatio: state.splitRatio,
        leftPanelHostId: state.leftPanelHostId,
        rightPanelHostId: state.rightPanelHostId,
      }),
    }
  )
);
