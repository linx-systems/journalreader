/**
 * Centralized constants for timing and threshold values.
 * Extracted from various files to improve maintainability and readability.
 */

// =============================================================================
// Time Unit Constants (in milliseconds)
// =============================================================================

/** One minute in milliseconds */
export const MINUTE_MS = 60 * 1000;

/** One hour in milliseconds */
export const HOUR_MS = 60 * MINUTE_MS;

/** One day in milliseconds */
export const DAY_MS = 24 * HOUR_MS;

/** One week in milliseconds */
export const WEEK_MS = 7 * DAY_MS;

// =============================================================================
// UI Timing Constants
// =============================================================================

/** Debounce delay for filter changes in follow mode (ms) */
export const DEBOUNCE_MS = 300;

/** Timeout for detecting 'gg' keyboard sequence in vim-style navigation (ms) */
export const KEYBOARD_SEQUENCE_TIMEOUT_MS = 500;

/** Time offset for scroll sync - loads entries from this far before anchor timestamp (ms) */
export const SCROLL_SYNC_OFFSET_MS = 5 * MINUTE_MS;

// =============================================================================
// Granularity Threshold Constants
// =============================================================================

/** Default time range for statistics when no 'since' is specified */
export const DEFAULT_TIME_RANGE_MS = 15 * MINUTE_MS;

/**
 * Thresholds for auto-selecting granularity based on time range.
 * Used by computeGranularityMs() to determine appropriate bucket sizes.
 */
export const GRANULARITY_THRESHOLDS = {
  /** Below this threshold: use 10-minute buckets */
  SIX_HOURS: 6 * HOUR_MS,
  /** Below this threshold: use 1-hour buckets */
  ONE_DAY: DAY_MS,
  /** Below this threshold: use 6-hour buckets */
  ONE_WEEK: 7 * DAY_MS,
  /** Below this threshold: use 1-day buckets (above: 1-week buckets) */
  ONE_MONTH: 30 * DAY_MS,
} as const;

/**
 * Bucket sizes for different granularity levels.
 */
export const GRANULARITY_BUCKET_SIZES = {
  TEN_MINUTES: 10 * MINUTE_MS,
  ONE_HOUR: HOUR_MS,
  SIX_HOURS: 6 * HOUR_MS,
  ONE_DAY: DAY_MS,
  ONE_WEEK: WEEK_MS,
} as const;
