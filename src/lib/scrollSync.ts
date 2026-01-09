import type { JournalEntry } from './types';

/**
 * Find the index of the entry closest to the target timestamp using binary search.
 * Returns the index of the closest match even if exact timestamp is not found.
 *
 * @param entries - Array of journal entries (sorted by timestamp)
 * @param targetTimestamp - Timestamp to find in microseconds since epoch
 * @param isNewestFirst - Whether entries are sorted newest-first (reverse: true)
 * @returns Index of the closest entry, or -1 if array is empty
 */
export function findEntryIndexByTimestamp(
  entries: JournalEntry[],
  targetTimestamp: number,
  isNewestFirst: boolean = true
): number {
  if (entries.length === 0) {
    return -1;
  }

  let left = 0;
  let right = entries.length - 1;

  // Handle edge cases
  if (isNewestFirst) {
    // Newest-first: timestamps are in descending order
    // First entry has the highest timestamp, last entry has the lowest
    if (targetTimestamp >= entries[0].realtimeTimestamp) {
      return 0;
    }
    if (targetTimestamp <= entries[right].realtimeTimestamp) {
      return right;
    }
  } else {
    // Oldest-first: timestamps are in ascending order
    // First entry has the lowest timestamp, last entry has the highest
    if (targetTimestamp <= entries[0].realtimeTimestamp) {
      return 0;
    }
    if (targetTimestamp >= entries[right].realtimeTimestamp) {
      return right;
    }
  }

  // Binary search for closest match
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midTimestamp = entries[mid].realtimeTimestamp;

    if (midTimestamp === targetTimestamp) {
      return mid;
    }

    if (isNewestFirst) {
      // Descending order: larger timestamps come first
      if (midTimestamp > targetTimestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    } else {
      // Ascending order: smaller timestamps come first
      if (midTimestamp < targetTimestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
  }

  // At this point, left === right
  // Check if we should return left or an adjacent index for closest match
  const leftTimestamp = entries[left].realtimeTimestamp;
  const leftDiff = Math.abs(leftTimestamp - targetTimestamp);

  // Check adjacent entries for closer match
  if (left > 0) {
    const prevDiff = Math.abs(entries[left - 1].realtimeTimestamp - targetTimestamp);
    if (prevDiff < leftDiff) {
      return left - 1;
    }
  }

  if (left < entries.length - 1) {
    const nextDiff = Math.abs(entries[left + 1].realtimeTimestamp - targetTimestamp);
    if (nextDiff < leftDiff) {
      return left + 1;
    }
  }

  return left;
}

/**
 * Get the timestamp of a visible entry at a specific viewport position.
 * Used to determine the anchor timestamp when broadcasting scroll position.
 *
 * @param entries - Array of journal entries
 * @param visibleStartIndex - Index of the first visible entry
 * @param visibleEndIndex - Index of the last visible entry
 * @param viewportPosition - Position in viewport (0 = top, 1 = bottom), default 0.3 (upper third)
 * @returns Timestamp in microseconds, or null if no entries visible
 */
export function getVisibleTimestamp(
  entries: JournalEntry[],
  visibleStartIndex: number,
  visibleEndIndex: number,
  viewportPosition: number = 0.3
): number | null {
  if (entries.length === 0 || visibleStartIndex < 0) {
    return null;
  }

  // Clamp indices to valid range
  const startIndex = Math.max(0, visibleStartIndex);
  const endIndex = Math.min(entries.length - 1, visibleEndIndex);

  // Calculate the target index based on viewport position
  const visibleCount = endIndex - startIndex + 1;
  const targetOffset = Math.floor(visibleCount * viewportPosition);
  const targetIndex = Math.min(startIndex + targetOffset, endIndex);

  return entries[targetIndex]?.realtimeTimestamp ?? null;
}

/**
 * Calculate the time difference between two timestamps for display.
 * Used to show how far apart timestamps are in different panels.
 *
 * @param timestamp1 - First timestamp in microseconds
 * @param timestamp2 - Second timestamp in microseconds
 * @returns Formatted string showing the time difference
 */
export function formatTimeDifference(timestamp1: number, timestamp2: number): string {
  // Convert microseconds to milliseconds
  const diffMs = Math.abs(timestamp1 - timestamp2) / 1000;

  if (diffMs < 1000) {
    return `${Math.round(diffMs)}ms`;
  }

  const diffSec = diffMs / 1000;
  if (diffSec < 60) {
    return `${diffSec.toFixed(1)}s`;
  }

  const diffMin = diffSec / 60;
  if (diffMin < 60) {
    return `${diffMin.toFixed(1)}min`;
  }

  const diffHour = diffMin / 60;
  return `${diffHour.toFixed(1)}h`;
}
