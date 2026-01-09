import { beforeEach, describe, expect, it } from 'vitest';
import { useScrollSyncStore } from '../scrollSyncStore';

const initialState = useScrollSyncStore.getState();

beforeEach(() => {
  useScrollSyncStore.setState(initialState, true);
});

describe('scrollSyncStore', () => {
  describe('initial state', () => {
    it('starts with sync disabled', () => {
      const state = useScrollSyncStore.getState();
      expect(state.syncEnabled).toBe(false);
    });

    it('starts with no anchor timestamp', () => {
      const state = useScrollSyncStore.getState();
      expect(state.anchorTimestamp).toBeNull();
    });

    it('starts with no source tab', () => {
      const state = useScrollSyncStore.getState();
      expect(state.sourceTabId).toBeNull();
    });

    it('starts with sync version 0', () => {
      const state = useScrollSyncStore.getState();
      expect(state.syncVersion).toBe(0);
    });
  });

  describe('setSyncEnabled', () => {
    it('enables sync mode', () => {
      const store = useScrollSyncStore.getState();
      store.setSyncEnabled(true);
      expect(useScrollSyncStore.getState().syncEnabled).toBe(true);
    });

    it('disables sync mode', () => {
      const store = useScrollSyncStore.getState();
      store.setSyncEnabled(true);
      store.setSyncEnabled(false);
      expect(useScrollSyncStore.getState().syncEnabled).toBe(false);
    });

    it('clears anchor when disabling', () => {
      const store = useScrollSyncStore.getState();
      store.setSyncEnabled(true);
      store.broadcastTimestamp(1234567890, 'tab-1');
      store.setSyncEnabled(false);

      const state = useScrollSyncStore.getState();
      expect(state.anchorTimestamp).toBeNull();
      expect(state.sourceTabId).toBeNull();
    });
  });

  describe('broadcastTimestamp', () => {
    it('sets anchor timestamp', () => {
      const store = useScrollSyncStore.getState();
      store.broadcastTimestamp(1234567890000000, 'tab-1');

      const state = useScrollSyncStore.getState();
      expect(state.anchorTimestamp).toBe(1234567890000000);
    });

    it('sets source tab id', () => {
      const store = useScrollSyncStore.getState();
      store.broadcastTimestamp(1234567890000000, 'tab-1');

      const state = useScrollSyncStore.getState();
      expect(state.sourceTabId).toBe('tab-1');
    });

    it('increments sync version', () => {
      const store = useScrollSyncStore.getState();
      const initialVersion = store.syncVersion;

      store.broadcastTimestamp(1234567890000000, 'tab-1');
      expect(useScrollSyncStore.getState().syncVersion).toBe(initialVersion + 1);

      store.broadcastTimestamp(1234567891000000, 'tab-2');
      expect(useScrollSyncStore.getState().syncVersion).toBe(initialVersion + 2);
    });

    it('updates timestamp from different source', () => {
      const store = useScrollSyncStore.getState();
      store.broadcastTimestamp(1234567890000000, 'tab-1');
      store.broadcastTimestamp(1234567891000000, 'tab-2');

      const state = useScrollSyncStore.getState();
      expect(state.anchorTimestamp).toBe(1234567891000000);
      expect(state.sourceTabId).toBe('tab-2');
    });
  });

  describe('clearAnchor', () => {
    it('clears anchor timestamp and source tab', () => {
      const store = useScrollSyncStore.getState();
      store.broadcastTimestamp(1234567890000000, 'tab-1');
      store.clearAnchor();

      const state = useScrollSyncStore.getState();
      expect(state.anchorTimestamp).toBeNull();
      expect(state.sourceTabId).toBeNull();
    });

    it('does not affect sync enabled state', () => {
      const store = useScrollSyncStore.getState();
      store.setSyncEnabled(true);
      store.broadcastTimestamp(1234567890000000, 'tab-1');
      store.clearAnchor();

      expect(useScrollSyncStore.getState().syncEnabled).toBe(true);
    });

    it('does not reset sync version', () => {
      const store = useScrollSyncStore.getState();
      store.broadcastTimestamp(1234567890000000, 'tab-1');
      const versionAfterBroadcast = useScrollSyncStore.getState().syncVersion;
      store.clearAnchor();

      expect(useScrollSyncStore.getState().syncVersion).toBe(versionAfterBroadcast);
    });
  });
});
