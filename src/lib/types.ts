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
  excludedUnits: string[];
  priorities?: number[];
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
  excludedUnits: [],
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
  { label: '30 days', value: '30 days ago' },
];

// Quick filter presets
export interface QuickFilter {
  id: string;
  label: string;
  filters: Partial<JournalFilter>;
}

export const QUICK_FILTERS: QuickFilter[] = [
  {
    id: 'errors',
    label: 'Errors',
    filters: { priorities: [0, 1, 2, 3] },
  },
  {
    id: 'last-hour-errors',
    label: 'Last Hour Errors',
    filters: { since: '1 hour ago', priorities: [0, 1, 2, 3] },
  },
  {
    id: 'warnings',
    label: 'Warnings+',
    filters: { priorities: [0, 1, 2, 3, 4] },
  },
  {
    id: 'today',
    label: 'Today',
    filters: { since: 'today' },
  },
  {
    id: 'this-boot',
    label: 'This Boot',
    filters: { bootOffset: 0 },
  },
];

// Follow mode event payloads
export interface FollowEvent {
  entries: JournalEntry[];
}

export interface FollowErrorEvent {
  message: string;
}

// Statistics types
export type TimeGranularity = 'auto' | '10min' | '1hour' | '6hour' | '1day' | '1week';

export interface StatisticsRequest {
  units: string[];
  excludedUnits: string[];
  priorities?: number[];
  since?: string;
  until?: string;
  grepPattern?: string;
  caseSensitive: boolean;
  bootId?: string;
  bootOffset?: number;
  identifier?: string;
  granularityMs: number;
}

export interface TimeseriesPoint {
  timestamp: number;
  count: number;
  errorCount: number;
  warningCount: number;
}

export interface PriorityCount {
  priority: number;
  label: string;
  count: number;
}

export interface ServiceCount {
  service: string;
  count: number;
}

export interface JournalStatistics {
  timeseries: TimeseriesPoint[];
  priorityDistribution: PriorityCount[];
  topServices: ServiceCount[];
  totalCount: number;
  errorRate: number;
}

// Remote host types
export type AuthMethod = 'password' | 'key' | 'agent';

export interface RemoteHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath?: string;
  sudoRequired: boolean;
}

export interface RemoteHostInput {
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath?: string;
  sudoRequired: boolean;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  hostId: string | null;
  status: ConnectionStatus;
  errorMessage: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  journalctlAvailable: boolean;
}

/**
 * Efficient shallow comparison for JournalFilter objects.
 * Avoids O(n) JSON.stringify by comparing fields directly.
 */
export function filtersEqual(a: JournalFilter | null, b: JournalFilter): boolean {
  if (!a) return false;

  // Compare primitives
  if (a.since !== b.since) return false;
  if (a.until !== b.until) return false;
  if (a.grepPattern !== b.grepPattern) return false;
  if (a.caseSensitive !== b.caseSensitive) return false;
  if (a.bootId !== b.bootId) return false;
  if (a.bootOffset !== b.bootOffset) return false;
  if (a.identifier !== b.identifier) return false;
  if (a.limit !== b.limit) return false;
  if (a.reverse !== b.reverse) return false;
  if (a.afterCursor !== b.afterCursor) return false;

  // Compare arrays (these are typically small)
  if (!arraysEqual(a.units, b.units)) return false;
  if (!arraysEqual(a.excludedUnits, b.excludedUnits)) return false;
  if (!arraysEqual(a.priorities, b.priorities)) return false;

  return true;
}

function arraysEqual<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
