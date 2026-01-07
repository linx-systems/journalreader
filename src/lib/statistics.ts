import type { TimeGranularity } from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function computeGranularityMs(
  granularity: TimeGranularity,
  since?: string,
  until?: string
): number {
  if (granularity !== 'auto') {
    const map: Record<Exclude<TimeGranularity, 'auto'>, number> = {
      '10min': 10 * MINUTE_MS,
      '1hour': HOUR_MS,
      '6hour': 6 * HOUR_MS,
      '1day': DAY_MS,
      '1week': WEEK_MS,
    };
    return map[granularity];
  }

  // Auto-detect based on time range
  const now = Date.now();
  const start = since ? parseRelativeTime(since) : now - 15 * MINUTE_MS;
  const end = until ? parseRelativeTime(until) : now;
  const rangeMs = end - start;

  if (rangeMs < 6 * HOUR_MS) return 10 * MINUTE_MS; // 10 min buckets
  if (rangeMs <= DAY_MS) return HOUR_MS; // 1 hour buckets
  if (rangeMs <= 7 * DAY_MS) return 6 * HOUR_MS; // 6 hour buckets
  if (rangeMs <= 30 * DAY_MS) return DAY_MS; // 1 day buckets
  return WEEK_MS; // 1 week buckets
}

function parseRelativeTime(timeStr: string): number {
  const now = Date.now();

  // Handle relative time strings like "15 minutes ago", "1 hour ago"
  const match = timeStr.match(/(\d+)\s+(minute|hour|day|week)s?\s+ago/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'minute':
        return now - value * MINUTE_MS;
      case 'hour':
        return now - value * HOUR_MS;
      case 'day':
        return now - value * DAY_MS;
      case 'week':
        return now - value * WEEK_MS;
    }
  }

  // Try parsing as ISO date
  const parsed = Date.parse(timeStr);
  if (!isNaN(parsed)) {
    return parsed;
  }

  return now;
}

export function getGranularityLabel(granularity: TimeGranularity): string {
  const labels: Record<TimeGranularity, string> = {
    auto: 'Auto',
    '10min': '10 min',
    '1hour': '1 hour',
    '6hour': '6 hours',
    '1day': '1 day',
    '1week': '1 week',
  };
  return labels[granularity];
}
