//! Tauri commands for offline journal storage operations.
//!
//! These commands expose the offline database CRUD operations to the frontend,
//! allowing the UI to query cached journal entries, manage sync state, and
//! control offline settings.

use crate::commands::remote::OfflineDatabaseState;
use crate::error::JournalError;
use crate::journal::{
    JournalEntry, JournalFilter, JournalQueryResult, OfflineSettings, RetentionPolicy,
    RetentionResult, StorageStats, SyncState, SyncStatus,
};
use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;

// ============================================================================
// Export Types
// ============================================================================

/// Supported export formats for offline logs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    /// JSON array of JournalEntry objects (re-importable)
    Json,
    /// Human-readable text format
    Text,
    /// CSV format for spreadsheets
    Csv,
}

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
/// Also resets the sync state for this host so that the next sync
/// will fetch all entries from the beginning.
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

    // Reset sync state so next sync fetches all entries from beginning
    let reset_state = SyncState {
        host_id: host_id.clone(),
        last_sync_timestamp: 0,
        last_cursor: None,
        sync_status: SyncStatus::Never,
        sync_error: None,
        entries_synced: 0,
    };
    db.update_sync_state(&reset_state)?;

    Ok(deleted as u64)
}

// ============================================================================
// Retention Commands
// ============================================================================

/// Apply retention policy to a specific host.
///
/// Keeps only the last N boots per host, deleting entries from older boots.
///
/// Returns details about what was deleted.
#[tauri::command]
pub fn apply_retention_now(
    host_id: String,
    policy: RetentionPolicy,
    state: State<'_, OfflineDatabaseState>,
) -> Result<RetentionResult, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    Ok(db.apply_retention_with_result(&host_id, &policy))
}

/// Apply retention policy to all hosts.
///
/// Keeps only the last N boots per host, deleting entries from older boots.
///
/// Returns results for each host affected.
#[tauri::command]
pub fn apply_retention_all(
    policy: RetentionPolicy,
    state: State<'_, OfflineDatabaseState>,
) -> Result<Vec<RetentionResult>, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.apply_retention_all(&policy)
}

/// Get the current retention policy derived from settings.
#[tauri::command]
pub fn get_retention_policy(
    state: State<'_, OfflineDatabaseState>,
) -> Result<RetentionPolicy, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    db.get_retention_policy()
}

// ============================================================================
// Export Commands
// ============================================================================

/// Export offline logs to a file in the specified format.
///
/// Queries all entries matching the filter for the given host and writes them
/// to the specified file path in the requested format.
///
/// Returns the number of entries exported.
#[tauri::command]
pub fn export_offline_logs(
    host_id: String,
    filter: JournalFilter,
    format: ExportFormat,
    path: String,
    state: State<'_, OfflineDatabaseState>,
) -> Result<u64, JournalError> {
    let db = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    // Query all entries without limit for export
    let mut export_filter = filter.clone();
    export_filter.limit = 0; // Use default/max for export
    export_filter.reverse = false; // Export in chronological order

    let entries = db.query_entries(&host_id, &export_filter)?;

    if entries.is_empty() {
        return Ok(0);
    }

    // Write to file based on format
    match format {
        ExportFormat::Json => write_json(&path, &entries)?,
        ExportFormat::Text => write_text(&path, &entries)?,
        ExportFormat::Csv => write_csv(&path, &entries)?,
    }

    Ok(entries.len() as u64)
}

/// Write entries as JSON array to file.
fn write_json(path: &str, entries: &[JournalEntry]) -> Result<(), JournalError> {
    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let writer = BufWriter::new(file);

    serde_json::to_writer_pretty(writer, entries)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to write JSON: {}", e)))?;

    Ok(())
}

/// Write entries as human-readable text to file.
fn write_text(path: &str, entries: &[JournalEntry]) -> Result<(), JournalError> {
    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let mut writer = BufWriter::new(file);

    for entry in entries {
        let timestamp = format_timestamp(entry.realtime_timestamp);
        let priority_label = priority_to_label(entry.priority);
        let unit = entry.systemd_unit.as_deref().unwrap_or("-");

        writeln!(
            writer,
            "[{}] [{}] [{}]: {}",
            timestamp, priority_label, unit, entry.message
        )
        .map_err(|e| JournalError::ExecutionError(format!("Failed to write text: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to flush file: {}", e)))?;

    Ok(())
}

/// Write entries as CSV to file.
fn write_csv(path: &str, entries: &[JournalEntry]) -> Result<(), JournalError> {
    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let mut writer = BufWriter::new(file);

    // Write header row
    writeln!(writer, "timestamp,priority,unit,identifier,pid,message")
        .map_err(|e| JournalError::ExecutionError(format!("Failed to write CSV header: {}", e)))?;

    for entry in entries {
        let timestamp = format_timestamp_iso(entry.realtime_timestamp);
        let unit = entry.systemd_unit.as_deref().unwrap_or("");
        let identifier = entry.syslog_identifier.as_deref().unwrap_or("");
        let pid = entry.pid.map(|p| p.to_string()).unwrap_or_default();
        // Escape message for CSV (double quotes and wrap in quotes)
        let message = escape_csv(&entry.message);

        writeln!(
            writer,
            "{},{},{},{},{},{}",
            timestamp, entry.priority, unit, identifier, pid, message
        )
        .map_err(|e| JournalError::ExecutionError(format!("Failed to write CSV row: {}", e)))?;
    }

    writer
        .flush()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to flush file: {}", e)))?;

    Ok(())
}

/// Format timestamp as human-readable string for text export.
fn format_timestamp(micros: i64) -> String {
    let secs = micros / 1_000_000;
    let nanos = ((micros % 1_000_000) * 1000) as u32;
    if let Some(dt) = Utc.timestamp_opt(secs, nanos).single() {
        dt.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        format!("{}", micros)
    }
}

/// Format timestamp as ISO 8601 string for CSV export.
fn format_timestamp_iso(micros: i64) -> String {
    let secs = micros / 1_000_000;
    let nanos = ((micros % 1_000_000) * 1000) as u32;
    if let Some(dt) = Utc.timestamp_opt(secs, nanos).single() {
        dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
    } else {
        format!("{}", micros)
    }
}

/// Convert priority number to short label for text export.
fn priority_to_label(priority: u8) -> &'static str {
    match priority {
        0 => "EMERG",
        1 => "ALERT",
        2 => "CRIT",
        3 => "ERR",
        4 => "WARN",
        5 => "NOTICE",
        6 => "INFO",
        7 => "DEBUG",
        _ => "???",
    }
}

/// Escape a string for CSV format.
fn escape_csv(s: &str) -> String {
    if s.contains('"') || s.contains(',') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
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
