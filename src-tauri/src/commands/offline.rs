//! Tauri commands for offline journal storage operations.
//!
//! These commands expose the offline database CRUD operations to the frontend,
//! allowing the UI to query cached journal entries, manage sync state, and
//! control offline settings.

use crate::commands::remote::OfflineDatabaseState;
use crate::error::JournalError;
use crate::journal::{JournalFilter, JournalQueryResult, OfflineSettings, StorageStats, SyncState};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;

/// Global offline mode flag.
/// When true, the app should use offline storage instead of remote connections.
static OFFLINE_MODE: AtomicBool = AtomicBool::new(false);

// ============================================================================
// Offline Journal Query Commands
// ============================================================================

/// Query journal entries from offline storage for a specific host.
///
/// Returns entries matching the filter criteria from the local SQLite database.
#[tauri::command]
pub fn query_offline_journal(
    host_id: String,
    filter: JournalFilter,
    state: State<'_, OfflineDatabaseState>,
) -> Result<JournalQueryResult, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    let entries = db.query_entries(&host_id, &filter)?;

    let has_more = entries.len() as u32 >= filter.limit && filter.limit > 0;
    let cursor_start = entries.first().map(|e| e.cursor.clone());
    let cursor_end = entries.last().map(|e| e.cursor.clone());

    Ok(JournalQueryResult {
        entries,
        has_more,
        cursor_start,
        cursor_end,
    })
}

/// Get the count of offline journal entries matching the filter criteria.
#[tauri::command]
pub fn get_offline_log_count(
    host_id: String,
    filter: JournalFilter,
    state: State<'_, OfflineDatabaseState>,
) -> Result<u64, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    let count = db.count_entries(&host_id, &filter)?;
    Ok(count as u64)
}

// ============================================================================
// Sync State Commands
// ============================================================================

/// Get the sync state for a specific host.
///
/// Returns information about when the host was last synced, the last cursor,
/// and the sync status.
#[tauri::command]
pub fn get_sync_state(
    host_id: String,
    state: State<'_, OfflineDatabaseState>,
) -> Result<SyncState, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_sync_state(&host_id)
}

/// Get sync states for all hosts that have been synced.
///
/// Returns a list of sync states for all hosts with entries in the database.
#[tauri::command]
pub fn get_all_sync_states(
    state: State<'_, OfflineDatabaseState>,
) -> Result<Vec<SyncState>, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_all_sync_states()
}

// ============================================================================
// Storage Statistics Commands
// ============================================================================

/// Get storage statistics for a specific host.
///
/// Returns entry counts, timestamp ranges, and database size information.
#[tauri::command]
pub fn get_storage_stats(
    host_id: String,
    state: State<'_, OfflineDatabaseState>,
) -> Result<StorageStats, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_storage_stats(&host_id)
}

/// Get storage statistics for all hosts.
///
/// Returns a list of storage stats for all hosts with entries in the database.
#[tauri::command]
pub fn get_all_storage_stats(
    state: State<'_, OfflineDatabaseState>,
) -> Result<Vec<StorageStats>, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_all_storage_stats()
}

// ============================================================================
// Data Management Commands
// ============================================================================

/// Delete all offline logs for a specific host.
///
/// Returns the number of entries deleted.
#[tauri::command]
pub fn delete_offline_logs(
    host_id: String,
    state: State<'_, OfflineDatabaseState>,
) -> Result<u64, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    let deleted = db.delete_all_entries(&host_id)?;
    Ok(deleted as u64)
}

// ============================================================================
// Offline Settings Commands
// ============================================================================

/// Get the current offline settings.
///
/// Returns the global offline settings configuration.
#[tauri::command]
pub fn get_offline_settings(
    state: State<'_, OfflineDatabaseState>,
) -> Result<OfflineSettings, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_offline_settings()
}

/// Update the offline settings.
///
/// Saves new offline settings configuration.
#[tauri::command]
pub fn update_offline_settings(
    settings: OfflineSettings,
    state: State<'_, OfflineDatabaseState>,
) -> Result<(), JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.update_offline_settings(&settings)
}

// ============================================================================
// Offline Mode Commands
// ============================================================================

/// Check if the app is currently in offline mode.
///
/// When in offline mode, the app uses cached data instead of remote connections.
#[tauri::command]
pub fn is_offline_mode() -> bool {
    OFFLINE_MODE.load(Ordering::SeqCst)
}

/// Set the offline mode state.
///
/// When set to true, the app will use cached data instead of remote connections.
#[tauri::command]
pub fn set_offline_mode(offline: bool) {
    OFFLINE_MODE.store(offline, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offline_mode_default() {
        // Reset to default for test
        OFFLINE_MODE.store(false, Ordering::SeqCst);
        assert!(!is_offline_mode());
    }

    #[test]
    fn test_offline_mode_toggle() {
        OFFLINE_MODE.store(false, Ordering::SeqCst);
        assert!(!is_offline_mode());

        set_offline_mode(true);
        assert!(is_offline_mode());

        set_offline_mode(false);
        assert!(!is_offline_mode());
    }
}
