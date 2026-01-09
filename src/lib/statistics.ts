import type { TimeGranularity } from './types';
import {
  MINUTE_MS,
  HOUR_MS,
  DAY_MS,
  WEEK_MS,
  DEFAULT_TIME_RANGE_MS,
  GRANULARITY_THRESHOLDS,
  GRANULARITY_BUCKET_SIZES,
} from './constants';

export function computeGranularityMs(
  granularity: TimeGranularity,
  since?: string,
  until?: string
): number {
  if (granularity !== 'auto') {
    const map: Record<Exclude<TimeGranularity, 'auto'>, number> = {
      '10min': GRANULARITY_BUCKET_SIZES.TEN_MINUTES,
      '1hour': GRANULARITY_BUCKET_SIZES.ONE_HOUR,
      '6hour': GRANULARITY_BUCKET_SIZES.SIX_HOURS,
      '1day': GRANULARITY_BUCKET_SIZES.ONE_DAY,
      '1week': GRANULARITY_BUCKET_SIZES.ONE_WEEK,
    };
    return map[granularity];
  }

  // Auto-detect based on time range
  const now = Date.now();
  const start = since ? parseRelativeTime(since) : now - DEFAULT_TIME_RANGE_MS;
  const end = until ? parseRelativeTime(until) : now;
  const rangeMs = end - start;

  if (rangeMs < GRANULARITY_THRESHOLDS.SIX_HOURS) return GRANULARITY_BUCKET_SIZES.TEN_MINUTES;
  if (rangeMs <= GRANULARITY_THRESHOLDS.ONE_DAY) return GRANULARITY_BUCKET_SIZES.ONE_HOUR;
  if (rangeMs <= GRANULARITY_THRESHOLDS.ONE_WEEK) return GRANULARITY_BUCKET_SIZES.SIX_HOURS;
  if (rangeMs <= GRANULARITY_THRESHOLDS.ONE_MONTH) return GRANULARITY_BUCKET_SIZES.ONE_DAY;
  return GRANULARITY_BUCKET_SIZES.ONE_WEEK;
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
