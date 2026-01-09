import { describe, expect, it } from 'vitest';
import {
  findEntryIndexByTimestamp,
  getVisibleTimestamp,
  formatTimeDifference,
} from '../scrollSync';
import type { JournalEntry } from '../types';

// Helper to create mock entries
function createEntry(timestamp: number): JournalEntry {
  return {
    cursor: `cursor-${timestamp}`,
    realtimeTimestamp: timestamp,
    bootId: 'boot-1',
    message: `Message at ${timestamp}`,
    priority: 6,
  };
}

describe('findEntryIndexByTimestamp', () => {
  describe('with empty array', () => {
    it('returns -1', () => {
      expect(findEntryIndexByTimestamp([], 1000, true)).toBe(-1);
      expect(findEntryIndexByTimestamp([], 1000, false)).toBe(-1);
    });
  });

  describe('with single entry', () => {
    const entries = [createEntry(1000)];

    it('returns 0 for exact match', () => {
      expect(findEntryIndexByTimestamp(entries, 1000, true)).toBe(0);
      expect(findEntryIndexByTimestamp(entries, 1000, false)).toBe(0);
    });

    it('returns 0 for any timestamp', () => {
      expect(findEntryIndexByTimestamp(entries, 500, true)).toBe(0);
      expect(findEntryIndexByTimestamp(entries, 1500, true)).toBe(0);
      expect(findEntryIndexByTimestamp(entries, 500, false)).toBe(0);
      expect(findEntryIndexByTimestamp(entries, 1500, false)).toBe(0);
    });
  });

  describe('with newest-first (descending) entries', () => {
    // Timestamps: 5000, 4000, 3000, 2000, 1000 (newest to oldest)
    const entries = [
      createEntry(5000),
      createEntry(4000),
      createEntry(3000),
      createEntry(2000),
      createEntry(1000),
    ];

    it('finds exact match', () => {
      expect(findEntryIndexByTimestamp(entries, 3000, true)).toBe(2);
    });

    it('returns 0 for timestamp greater than max', () => {
      expect(findEntryIndexByTimestamp(entries, 6000, true)).toBe(0);
    });

    it('returns last index for timestamp less than min', () => {
      expect(findEntryIndexByTimestamp(entries, 500, true)).toBe(4);
    });

    it('finds closest match when timestamp is between entries', () => {
      // 3500 is between 4000 and 3000, closer to 4000
      expect(findEntryIndexByTimestamp(entries, 3500, true)).toBe(2); // or 1, depends on tie-breaker
      // 2200 is between 3000 and 2000, closer to 2000
      expect(findEntryIndexByTimestamp(entries, 2200, true)).toBe(3);
    });
  });

  describe('with oldest-first (ascending) entries', () => {
    // Timestamps: 1000, 2000, 3000, 4000, 5000 (oldest to newest)
    const entries = [
      createEntry(1000),
      createEntry(2000),
      createEntry(3000),
      createEntry(4000),
      createEntry(5000),
    ];

    it('finds exact match', () => {
      expect(findEntryIndexByTimestamp(entries, 3000, false)).toBe(2);
    });

    it('returns 0 for timestamp less than min', () => {
      expect(findEntryIndexByTimestamp(entries, 500, false)).toBe(0);
    });

    it('returns last index for timestamp greater than max', () => {
      expect(findEntryIndexByTimestamp(entries, 6000, false)).toBe(4);
    });

    it('finds closest match when timestamp is between entries', () => {
      // 2700 is between 2000 and 3000, closer to 3000
      expect(findEntryIndexByTimestamp(entries, 2700, false)).toBe(2);
      // 2300 is between 2000 and 3000, closer to 2000
      expect(findEntryIndexByTimestamp(entries, 2300, false)).toBe(1);
    });
  });

  describe('with many entries', () => {
    // Create 1000 entries for performance testing
    const entries = Array.from({ length: 1000 }, (_, i) =>
      createEntry(10000 - i * 10) // 10000, 9990, 9980, ... descending
    );

    it('finds entries efficiently with binary search', () => {
      expect(findEntryIndexByTimestamp(entries, 5000, true)).toBe(500);
      expect(findEntryIndexByTimestamp(entries, 7500, true)).toBe(250);
    });
  });
});

describe('getVisibleTimestamp', () => {
  const entries = [
    createEntry(5000),
    createEntry(4000),
    createEntry(3000),
    createEntry(2000),
    createEntry(1000),
  ];

  describe('with empty entries', () => {
    it('returns null', () => {
      expect(getVisibleTimestamp([], 0, 0)).toBeNull();
    });
  });

  describe('with invalid indices', () => {
    it('returns null for negative start index', () => {
      expect(getVisibleTimestamp(entries, -1, 2)).toBeNull();
    });
  });

  describe('with valid indices', () => {
    it('returns timestamp at default position (0.3 - upper third)', () => {
      // Visible items: index 1-4 (4 items)
      // 0.3 * 4 = 1.2, floor = 1
      // Target index = 1 + 1 = 2
      const timestamp = getVisibleTimestamp(entries, 1, 4);
      expect(timestamp).toBe(3000); // Entry at index 2
    });

    it('returns timestamp at top (position 0)', () => {
      const timestamp = getVisibleTimestamp(entries, 1, 4, 0);
      expect(timestamp).toBe(4000); // Entry at index 1
    });

    it('returns timestamp at bottom (position 1)', () => {
      const timestamp = getVisibleTimestamp(entries, 1, 4, 1);
      expect(timestamp).toBe(1000); // Entry at index 4
    });

    it('returns timestamp at middle (position 0.5)', () => {
      // Visible items: index 0-4 (5 items)
      // 0.5 * 5 = 2.5, floor = 2
      // Target index = 0 + 2 = 2
      const timestamp = getVisibleTimestamp(entries, 0, 4, 0.5);
      expect(timestamp).toBe(3000); // Entry at index 2
    });

    it('clamps to valid range', () => {
      // Start index out of bounds, should clamp to 0
      const timestamp = getVisibleTimestamp(entries, -5, 2);
      expect(timestamp).toBeNull(); // -5 < 0 returns null
    });
  });

  describe('with single visible item', () => {
    it('returns that item timestamp regardless of position', () => {
      expect(getVisibleTimestamp(entries, 2, 2, 0)).toBe(3000);
      expect(getVisibleTimestamp(entries, 2, 2, 0.5)).toBe(3000);
      expect(getVisibleTimestamp(entries, 2, 2, 1)).toBe(3000);
    });
  });
});

describe('formatTimeDifference', () => {
  // Timestamps are in microseconds
  const MS = 1000; // 1ms in microseconds
  const SEC = 1000 * MS;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;

  describe('milliseconds', () => {
    it('formats small differences as ms', () => {
      // 500 microseconds = 0.5ms, rounds to 1ms
      expect(formatTimeDifference(1000000, 1000500)).toBe('1ms');
      expect(formatTimeDifference(1000000, 1001000)).toBe('1ms');
      expect(formatTimeDifference(1000000, 1500000)).toBe('500ms');
      expect(formatTimeDifference(1000000, 1999000)).toBe('999ms');
    });
  });

  describe('seconds', () => {
    it('formats differences as seconds', () => {
      expect(formatTimeDifference(0, 1 * SEC)).toBe('1.0s');
      expect(formatTimeDifference(0, 30 * SEC)).toBe('30.0s');
      expect(formatTimeDifference(0, 59 * SEC)).toBe('59.0s');
    });
  });

  describe('minutes', () => {
    it('formats differences as minutes', () => {
      expect(formatTimeDifference(0, 1 * MIN)).toBe('1.0min');
      expect(formatTimeDifference(0, 30 * MIN)).toBe('30.0min');
      expect(formatTimeDifference(0, 59 * MIN)).toBe('59.0min');
    });
  });

  describe('hours', () => {
    it('formats differences as hours', () => {
      expect(formatTimeDifference(0, 1 * HOUR)).toBe('1.0h');
      expect(formatTimeDifference(0, 24 * HOUR)).toBe('24.0h');
    });
  });

  describe('order independence', () => {
    it('handles both orders', () => {
      expect(formatTimeDifference(1000000, 2000000)).toBe(
        formatTimeDifference(2000000, 1000000)
      );
    });
  });
});
