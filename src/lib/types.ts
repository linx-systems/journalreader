export interface JournalEntry {
  cursor: string;
  realtimeTimestamp: number;
  monotonicTimestamp?: number;
  bootId: string;
  message: string;
  priority: number;
  syslogIdentifier?: string;
  systemdUnit?: string;
  pid?: number;
  uid?: number;
  gid?: number;
  exe?: string;
  cmdline?: string;
  hostname?: string;
  comm?: string;
}

export interface JournalFilter {
  units: string[];
  priorityMin?: number;
  priorityMax?: number;
  since?: string;
  until?: string;
  grepPattern?: string;
  caseSensitive: boolean;
  bootId?: string;
  bootOffset?: number;
  identifier?: string;
  limit: number;
  reverse: boolean;
  afterCursor?: string;
}

export interface JournalQueryResult {
  entries: JournalEntry[];
  hasMore: boolean;
  cursorStart?: string;
  cursorEnd?: string;
}

export interface SystemUnit {
  name: string;
  description?: string;
  loadState?: string;
  activeState?: string;
  subState?: string;
}

export interface BootInfo {
  bootId: string;
  bootOffset: number;
  firstEntry?: number;
  lastEntry?: number;
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'emerg',
  1: 'alert',
  2: 'crit',
  3: 'err',
  4: 'warning',
  5: 'notice',
  6: 'info',
  7: 'debug',
};

export const PRIORITY_COLORS: Record<number, string> = {
  0: 'text-red-600 dark:text-red-400',
  1: 'text-orange-600 dark:text-orange-400',
  2: 'text-amber-600 dark:text-amber-400',
  3: 'text-yellow-600 dark:text-yellow-400',
  4: 'text-lime-600 dark:text-lime-400',
  5: 'text-green-600 dark:text-green-400',
  6: 'text-sky-600 dark:text-sky-400',
  7: 'text-gray-500 dark:text-gray-400',
};

export const PRIORITY_BG_COLORS: Record<number, string> = {
  0: 'bg-red-100 dark:bg-red-900/30',
  1: 'bg-orange-100 dark:bg-orange-900/30',
  2: 'bg-amber-100 dark:bg-amber-900/30',
  3: 'bg-yellow-100 dark:bg-yellow-900/30',
  4: 'bg-lime-100 dark:bg-lime-900/30',
  5: 'bg-green-100 dark:bg-green-900/30',
  6: 'bg-sky-100 dark:bg-sky-900/30',
  7: 'bg-gray-100 dark:bg-gray-800/30',
};

export const DEFAULT_FILTER: JournalFilter = {
  units: [],
  caseSensitive: false,
  limit: 500,
  reverse: true,
};

export type TimePreset = {
  label: string;
  value: string;
};

export const TIME_PRESETS: TimePreset[] = [
  { label: '15 min', value: '15 minutes ago' },
  { label: '1 hour', value: '1 hour ago' },
  { label: '6 hours', value: '6 hours ago' },
  { label: '24 hours', value: '24 hours ago' },
  { label: '7 days', value: '7 days ago' },
  { label: 'This boot', value: '' }, // Special case: use boot filter
];
