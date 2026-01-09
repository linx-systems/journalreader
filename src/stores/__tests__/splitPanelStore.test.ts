import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useSplitPanelStore } from '../splitPanelStore';
import type { JournalEntry } from '../../lib/types';

// Helper to create mock journal entries
function createMockEntry(cursor: string, message: string): JournalEntry {
  return {
    cursor,
    realtimeTimestamp: Date.now() * 1000,
    bootId: 'test-boot-id',
    message,
    priority: 6,
    hostname: 'test-host',
    pid: 1234,
    syslogIdentifier: 'test',
  };
}

describe('splitPanelStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    act(() => {
      useSplitPanelStore.getState().clearAllPanels();
    });
  });

  describe('initial state', () => {
    it('should have empty entries for both panels', () => {
      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries).toEqual([]);
      expect(state.rightPanel.entries).toEqual([]);
      expect(state.leftPanel.isLoading).toBe(false);
      expect(state.rightPanel.isLoading).toBe(false);
    });
  });

  describe('left panel actions', () => {
    it('should set entries for left panel independently', () => {
      const entries = [createMockEntry('c1', 'left message')];

      act(() => {
        useSplitPanelStore.getState().setLeftEntries(entries);
      });

      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries).toEqual(entries);
      expect(state.rightPanel.entries).toEqual([]);
    });

    it('should append entries to left panel', () => {
      const initial = [createMockEntry('c1', 'first')];
      const additional = [createMockEntry('c2', 'second')];

      act(() => {
        useSplitPanelStore.getState().setLeftEntries(initial);
        useSplitPanelStore.getState().appendLeftEntries(additional);
      });

      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries).toHaveLength(2);
      expect(state.leftPanel.entries[0].cursor).toBe('c1');
      expect(state.leftPanel.entries[1].cursor).toBe('c2');
    });

    it('should set loading state for left panel', () => {
      act(() => {
        useSplitPanelStore.getState().setLeftLoading(true);
      });

      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.isLoading).toBe(true);
      expect(state.rightPanel.isLoading).toBe(false);
    });

    it('should clear left panel', () => {
      act(() => {
        useSplitPanelStore.getState().setLeftEntries([createMockEntry('c1', 'test')]);
        useSplitPanelStore.getState().setLeftLoading(true);
        useSplitPanelStore.getState().setLeftError('some error');
        useSplitPanelStore.getState().clearLeftPanel();
      });

      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries).toEqual([]);
      expect(state.leftPanel.isLoading).toBe(false);
      expect(state.leftPanel.error).toBe(null);
    });
  });

  describe('right panel actions', () => {
    it('should set entries for right panel independently', () => {
      const entries = [createMockEntry('c1', 'right message')];

      act(() => {
        useSplitPanelStore.getState().setRightEntries(entries);
      });

      const state = useSplitPanelStore.getState();
      expect(state.rightPanel.entries).toEqual(entries);
      expect(state.leftPanel.entries).toEqual([]);
    });

    it('should prepend entries to right panel (newest first)', () => {
      const initial = [createMockEntry('c2', 'second')];
      const newEntries = [createMockEntry('c1', 'first')];

      act(() => {
        useSplitPanelStore.getState().setRightEntries(initial);
        useSplitPanelStore.getState().prependRightEntries(newEntries, true);
      });

      const state = useSplitPanelStore.getState();
      expect(state.rightPanel.entries).toHaveLength(2);
      expect(state.rightPanel.entries[0].cursor).toBe('c1');
      expect(state.rightPanel.entries[1].cursor).toBe('c2');
    });

    it('should deduplicate when prepending entries', () => {
      const initial = [createMockEntry('c1', 'first'), createMockEntry('c2', 'second')];
      const duplicate = [createMockEntry('c1', 'duplicate'), createMockEntry('c3', 'third')];

      act(() => {
        useSplitPanelStore.getState().setRightEntries(initial);
        useSplitPanelStore.getState().prependRightEntries(duplicate, true);
      });

      const state = useSplitPanelStore.getState();
      expect(state.rightPanel.entries).toHaveLength(3);
      // c1 should not be duplicated, only c3 added
      const cursors = state.rightPanel.entries.map(e => e.cursor);
      expect(cursors.filter(c => c === 'c1')).toHaveLength(1);
      expect(cursors).toContain('c3');
    });
  });

  describe('independent panel state', () => {
    it('should maintain separate state for each panel', () => {
      const leftEntries = [createMockEntry('left1', 'left msg')];
      const rightEntries = [createMockEntry('right1', 'right msg')];

      act(() => {
        useSplitPanelStore.getState().setLeftEntries(leftEntries);
        useSplitPanelStore.getState().setRightEntries(rightEntries);
        useSplitPanelStore.getState().setLeftLoading(true);
        useSplitPanelStore.getState().setRightError('right error');
        useSplitPanelStore.getState().setLeftHasMore(true);
        useSplitPanelStore.getState().setRightCursorEnd('cursor123');
      });

      const state = useSplitPanelStore.getState();

      // Left panel state
      expect(state.leftPanel.entries).toEqual(leftEntries);
      expect(state.leftPanel.isLoading).toBe(true);
      expect(state.leftPanel.error).toBe(null);
      expect(state.leftPanel.hasMore).toBe(true);
      expect(state.leftPanel.cursorEnd).toBe(null);

      // Right panel state
      expect(state.rightPanel.entries).toEqual(rightEntries);
      expect(state.rightPanel.isLoading).toBe(false);
      expect(state.rightPanel.error).toBe('right error');
      expect(state.rightPanel.hasMore).toBe(false);
      expect(state.rightPanel.cursorEnd).toBe('cursor123');
    });

    it('should clear all panels at once', () => {
      act(() => {
        useSplitPanelStore.getState().setLeftEntries([createMockEntry('l1', 'left')]);
        useSplitPanelStore.getState().setRightEntries([createMockEntry('r1', 'right')]);
        useSplitPanelStore.getState().setLeftLoading(true);
        useSplitPanelStore.getState().setRightError('error');
        useSplitPanelStore.getState().clearAllPanels();
      });

      const state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries).toEqual([]);
      expect(state.rightPanel.entries).toEqual([]);
      expect(state.leftPanel.isLoading).toBe(false);
      expect(state.rightPanel.error).toBe(null);
    });
  });

  describe('swap panels behavior', () => {
    it('should allow different hosts to show different logs after swap', () => {
      // Simulate: Panel A shows host1 logs, Panel B shows host2 logs
      // When swap happens, the store maintains panel positions
      // but the UI passes different hostIds
      const host1Logs = [createMockEntry('h1-1', 'host1 log')];
      const host2Logs = [createMockEntry('h2-1', 'host2 log')];

      act(() => {
        // Before swap: left has host1, right has host2
        useSplitPanelStore.getState().setLeftEntries(host1Logs);
        useSplitPanelStore.getState().setRightEntries(host2Logs);
      });

      let state = useSplitPanelStore.getState();
      expect(state.leftPanel.entries[0].message).toBe('host1 log');
      expect(state.rightPanel.entries[0].message).toBe('host2 log');

      // After swap: the layoutStore swaps hostIds, triggering new fetches
      // The panel store will receive new entries based on the swapped hostIds
      act(() => {
        // Clear and set new entries (simulating refetch after hostId change)
        useSplitPanelStore.getState().setLeftEntries(host2Logs);
        useSplitPanelStore.getState().setRightEntries(host1Logs);
      });

      state = useSplitPanelStore.getState();
      // Now left has host2 logs, right has host1 logs
      expect(state.leftPanel.entries[0].message).toBe('host2 log');
      expect(state.rightPanel.entries[0].message).toBe('host1 log');
    });
  });
});
