/**
 * Tauri command wrappers for offline storage operations.
 * These functions wrap the Tauri invoke calls for offline/sync functionality.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  SyncState,
  StorageStats,
  OfflineSettings,
  SyncResult,
  ExportFormat,
} from './offlineTypes';
import type { JournalFilter, JournalQueryResult } from './types';

// ============================================================================
// Offline Journal Query Commands
// ============================================================================

/**
 * Query journal entries from offline storage for a specific host.
 */
export async function queryOfflineJournal(
  hostId: string,
  filter: JournalFilter
): Promise<JournalQueryResult> {
  return invoke<JournalQueryResult>('query_offline_journal', { hostId, filter });
}

/**
 * Get the count of offline journal entries matching the filter criteria.
 */
export async function getOfflineLogCount(
  hostId: string,
  filter: JournalFilter
): Promise<number> {
  return invoke<number>('get_offline_log_count', { hostId, filter });
}

// ============================================================================
// Sync State Commands
// ============================================================================

/**
 * Get the sync state for a specific host.
 */
export async function getSyncState(hostId: string): Promise<SyncState> {
  return invoke<SyncState>('get_sync_state', { hostId });
}

/**
 * Get sync states for all hosts that have been synced.
 */
export async function getAllSyncStates(): Promise<SyncState[]> {
  return invoke<SyncState[]>('get_all_sync_states');
}

// ============================================================================
// Storage Statistics Commands
// ============================================================================

/**
 * Get storage statistics for a specific host.
 */
export async function getStorageStats(hostId: string): Promise<StorageStats> {
  return invoke<StorageStats>('get_storage_stats', { hostId });
}

/**
 * Get storage statistics for all hosts.
 */
export async function getAllStorageStats(): Promise<StorageStats[]> {
  return invoke<StorageStats[]>('get_all_storage_stats');
}

// ============================================================================
// Data Management Commands
// ============================================================================

/**
 * Delete all offline logs for a specific host.
 * Returns the number of entries deleted.
 */
export async function deleteOfflineLogs(hostId: string): Promise<number> {
  return invoke<number>('delete_offline_logs', { hostId });
}

// ============================================================================
// Offline Settings Commands
// ============================================================================

/**
 * Get the current offline settings.
 */
export async function getOfflineSettings(): Promise<OfflineSettings> {
  return invoke<OfflineSettings>('get_offline_settings');
}

/**
 * Update the offline settings.
 */
export async function updateOfflineSettings(
  settings: OfflineSettings
): Promise<void> {
  return invoke<void>('update_offline_settings', { settings });
}


// ============================================================================
// Sync Commands
// ============================================================================

/**
 * Trigger synchronization for a specific host.
 * Progress events are emitted during the sync via Tauri events.
 */
export async function triggerSync(hostId: string): Promise<SyncResult> {
  return invoke<SyncResult>('trigger_sync', { hostId });
}

/**
 * Trigger synchronization for all configured hosts.
 * Returns a vector of SyncResult for each host.
 */
export async function triggerSyncAll(): Promise<SyncResult[]> {
  return invoke<SyncResult[]>('trigger_sync_all');
}

/**
 * Cancel an in-progress sync for a specific host.
 */
export async function cancelSync(hostId: string): Promise<void> {
  return invoke<void>('cancel_sync', { hostId });
}

/**
 * Check if a sync can be resumed for a host.
 */
export async function canResumeSync(hostId: string): Promise<boolean> {
  return invoke<boolean>('can_resume_sync', { hostId });
}

// ============================================================================
// Export Commands
// ============================================================================

/**
 * Export offline logs to a file in the specified format.
 * Returns the number of entries exported.
 */
export async function exportOfflineLogs(
  hostId: string,
  filter: JournalFilter,
  format: ExportFormat,
  path: string
): Promise<number> {
  return invoke<number>('export_offline_logs', { hostId, filter, format, path });
}
