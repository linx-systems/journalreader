import { beforeEach, describe, expect, it } from 'vitest';
import { useLayoutStore } from '../layoutStore';

const initialState = useLayoutStore.getState();

beforeEach(() => {
  useLayoutStore.setState(initialState, true);
});

describe('layoutStore', () => {
  describe('initial state', () => {
    it('starts with single layout', () => {
      const state = useLayoutStore.getState();
      expect(state.layout).toBe('single');
    });

    it('starts with 50/50 split ratio', () => {
      const state = useLayoutStore.getState();
      expect(state.splitRatio).toBe(0.5);
    });

    it('starts with no panel hosts assigned', () => {
      const state = useLayoutStore.getState();
      expect(state.leftPanelHostId).toBeNull();
      expect(state.rightPanelHostId).toBeNull();
    });

    it('has minimum panel size of 20%', () => {
      const state = useLayoutStore.getState();
      expect(state.minPanelSize).toBe(0.2);
    });
  });

  describe('setLayout', () => {
    it('changes to split-vertical layout', () => {
      const store = useLayoutStore.getState();
      store.setLayout('split-vertical');
      expect(useLayoutStore.getState().layout).toBe('split-vertical');
    });

    it('changes to split-horizontal layout', () => {
      const store = useLayoutStore.getState();
      store.setLayout('split-horizontal');
      expect(useLayoutStore.getState().layout).toBe('split-horizontal');
    });

    it('changes back to single layout', () => {
      const store = useLayoutStore.getState();
      store.setLayout('split-vertical');
      store.setLayout('single');
      expect(useLayoutStore.getState().layout).toBe('single');
    });
  });

  describe('setSplitRatio', () => {
    it('sets valid split ratio', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.3);
      expect(useLayoutStore.getState().splitRatio).toBe(0.3);
    });

    it('clamps ratio to minimum', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.1); // Below 0.2 minimum
      expect(useLayoutStore.getState().splitRatio).toBe(0.2);
    });

    it('clamps ratio to maximum', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.9); // Above 0.8 maximum (1 - 0.2)
      expect(useLayoutStore.getState().splitRatio).toBe(0.8);
    });

    it('clamps ratio at zero', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0);
      expect(useLayoutStore.getState().splitRatio).toBe(0.2);
    });

    it('clamps ratio at one', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(1);
      expect(useLayoutStore.getState().splitRatio).toBe(0.8);
    });
  });

  describe('resetSplitRatio', () => {
    it('resets to default 50/50 ratio', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.7);
      store.resetSplitRatio();
      expect(useLayoutStore.getState().splitRatio).toBe(0.5);
    });
  });

  describe('setLeftPanelHost', () => {
    it('sets left panel host id', () => {
      const store = useLayoutStore.getState();
      store.setLeftPanelHost('host-1');
      expect(useLayoutStore.getState().leftPanelHostId).toBe('host-1');
    });

    it('clears left panel host id', () => {
      const store = useLayoutStore.getState();
      store.setLeftPanelHost('host-1');
      store.setLeftPanelHost(null);
      expect(useLayoutStore.getState().leftPanelHostId).toBeNull();
    });
  });

  describe('setRightPanelHost', () => {
    it('sets right panel host id', () => {
      const store = useLayoutStore.getState();
      store.setRightPanelHost('host-2');
      expect(useLayoutStore.getState().rightPanelHostId).toBe('host-2');
    });

    it('clears right panel host id', () => {
      const store = useLayoutStore.getState();
      store.setRightPanelHost('host-2');
      store.setRightPanelHost(null);
      expect(useLayoutStore.getState().rightPanelHostId).toBeNull();
    });
  });

  describe('swapPanels', () => {
    it('swaps left and right panel hosts', () => {
      const store = useLayoutStore.getState();
      store.setLeftPanelHost('host-1');
      store.setRightPanelHost('host-2');
      store.swapPanels();

      const state = useLayoutStore.getState();
      expect(state.leftPanelHostId).toBe('host-2');
      expect(state.rightPanelHostId).toBe('host-1');
    });

    it('handles null values during swap', () => {
      const store = useLayoutStore.getState();
      store.setLeftPanelHost('host-1');
      store.setRightPanelHost(null);
      store.swapPanels();

      const state = useLayoutStore.getState();
      expect(state.leftPanelHostId).toBeNull();
      expect(state.rightPanelHostId).toBe('host-1');
    });
  });

  describe('enterSplitView', () => {
    it('enters vertical split view with hosts', () => {
      const store = useLayoutStore.getState();
      store.enterSplitView('split-vertical', 'host-1', 'host-2');

      const state = useLayoutStore.getState();
      expect(state.layout).toBe('split-vertical');
      expect(state.leftPanelHostId).toBe('host-1');
      expect(state.rightPanelHostId).toBe('host-2');
    });

    it('enters horizontal split view with hosts', () => {
      const store = useLayoutStore.getState();
      store.enterSplitView('split-horizontal', 'local', 'host-1');

      const state = useLayoutStore.getState();
      expect(state.layout).toBe('split-horizontal');
      expect(state.leftPanelHostId).toBe('local');
      expect(state.rightPanelHostId).toBe('host-1');
    });

    it('preserves split ratio when entering split view', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.7);
      store.enterSplitView('split-vertical', 'host-1', 'host-2');

      expect(useLayoutStore.getState().splitRatio).toBe(0.7);
    });
  });

  describe('exitSplitView', () => {
    it('returns to single layout', () => {
      const store = useLayoutStore.getState();
      store.enterSplitView('split-vertical', 'host-1', 'host-2');
      store.exitSplitView();

      expect(useLayoutStore.getState().layout).toBe('single');
    });

    it('clears panel host ids', () => {
      const store = useLayoutStore.getState();
      store.enterSplitView('split-vertical', 'host-1', 'host-2');
      store.exitSplitView();

      const state = useLayoutStore.getState();
      expect(state.leftPanelHostId).toBeNull();
      expect(state.rightPanelHostId).toBeNull();
    });

    it('preserves split ratio after exiting', () => {
      const store = useLayoutStore.getState();
      store.setSplitRatio(0.7);
      store.enterSplitView('split-vertical', 'host-1', 'host-2');
      store.exitSplitView();

      expect(useLayoutStore.getState().splitRatio).toBe(0.7);
    });
  });

  describe('integration scenarios', () => {
    it('supports full workflow: enter split, resize, swap, exit', () => {
      const store = useLayoutStore.getState();

      // Enter split view
      store.enterSplitView('split-vertical', 'local', 'host-1');
      expect(useLayoutStore.getState().layout).toBe('split-vertical');

      // Resize
      store.setSplitRatio(0.6);
      expect(useLayoutStore.getState().splitRatio).toBe(0.6);

      // Swap panels
      store.swapPanels();
      let state = useLayoutStore.getState();
      expect(state.leftPanelHostId).toBe('host-1');
      expect(state.rightPanelHostId).toBe('local');

      // Reset ratio
      store.resetSplitRatio();
      expect(useLayoutStore.getState().splitRatio).toBe(0.5);

      // Exit split view
      store.exitSplitView();
      state = useLayoutStore.getState();
      expect(state.layout).toBe('single');
      expect(state.leftPanelHostId).toBeNull();
      expect(state.rightPanelHostId).toBeNull();
    });

    it('allows switching between split layouts', () => {
      const store = useLayoutStore.getState();

      store.enterSplitView('split-vertical', 'host-1', 'host-2');
      expect(useLayoutStore.getState().layout).toBe('split-vertical');

      store.setLayout('split-horizontal');
      const state = useLayoutStore.getState();
      expect(state.layout).toBe('split-horizontal');
      // Panel hosts should be preserved
      expect(state.leftPanelHostId).toBe('host-1');
      expect(state.rightPanelHostId).toBe('host-2');
    });
  });
});
