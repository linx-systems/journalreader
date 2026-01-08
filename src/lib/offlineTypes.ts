/**
 * TypeScript types for offline storage and sync state management.
 * These types mirror the Rust types in src-tauri/src/journal/offline_types.rs
 */

/**
 * Sync status for a host
 */
export type SyncStatus = 'never' | 'in_progress' | 'completed' | 'failed';

/**
 * Sync state for a host
 */
export interface SyncState {
  /** Host ID */
  hostId: string;
  /** Last successful sync timestamp (Unix millis) */
  lastSyncTimestamp: number;
  /** Last cursor synced */
  lastCursor: string | null;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Error message if sync failed */
  syncError: string | null;
  /** Total entries synced for this host */
  entriesSynced: number;
}

/**
 * Storage statistics for a host
 */
export interface StorageStats {
  /** Host ID */
  hostId: string;
  /** Total entry count */
  entryCount: number;
  /** Oldest entry timestamp (Unix micros) */
  oldestTimestamp: number | null;
  /** Newest entry timestamp (Unix micros) */
  newestTimestamp: number | null;
  /** Database file size in bytes (global, not per-host) */
  dbSizeBytes: number;
}

/**
 * Offline settings
 */
export interface OfflineSettings {
  /** Whether offline mode is enabled */
  enabled: boolean;
  /** Retention period in days (0 = no limit) */
  retentionDays: number;
  /** Maximum entries to store (0 = no limit) */
  maxEntries: number;
  /** Whether to sync automatically when connected */
  autoSync: boolean;
}

/**
 * Default offline settings
 */
export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  enabled: true,
  retentionDays: 30,
  maxEntries: 100000,
  autoSync: true,
};

/**
 * Status types for sync progress events
 */
export type SyncProgressStatus =
  | 'starting'
  | 'fetching'
  | 'completed'
  | 'cancelled'
  | 'error';

/**
 * Event payload for sync progress updates
 */
export interface SyncProgressEvent {
  /** Host ID being synced */
  hostId: string;
  /** Current sync status */
  status: SyncProgressStatus;
  /** Number of entries synced so far */
  entriesSynced: number;
  /** Total entries synced for this host (cumulative) */
  totalEntries: number;
  /** Number of entries in current batch */
  batchSize: number;
  /** Error message if status is "error" */
  error: string | null;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Host ID that was synced */
  hostId: string;
  /** Whether sync completed successfully */
  success: boolean;
  /** Number of new entries synced */
  entriesSynced: number;
  /** Total entries for this host after sync */
  totalEntries: number;
  /** Error message if sync failed */
  error: string | null;
  /** Whether sync was cancelled */
  cancelled: boolean;
}

/**
 * Event payload for sync completed event
 */
export interface SyncCompletedEvent {
  hostId: string;
  entriesSynced: number;
  totalEntries: number;
}

/**
 * Event payload for sync failed event
 */
export interface SyncFailedEvent {
  hostId: string;
  error: string | null;
}

/**
 * Export format for offline logs
 */
export type ExportFormat = 'json' | 'text' | 'csv';
