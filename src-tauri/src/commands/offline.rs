//! Tauri commands for offline journal storage operations.
//!
//! These commands expose the offline database CRUD operations to the frontend,
//! allowing the UI to query cached journal entries, manage sync state, and
//! control offline settings.

use crate::commands::sync::SyncCancelState;
use crate::error::JournalError;
use crate::journal::offline_db::OfflineDatabase;
use crate::journal::{
    JournalEntry, JournalFilter, JournalQueryResult, OfflineSettings, RetentionPolicy,
    RetentionResult, StorageStats, SyncState, SyncStatus,
};
use crate::OfflineDatabaseState;
use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufWriter, Write};
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

    db.query_page(&host_id, &filter)
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
    cancel_state: State<'_, SyncCancelState>,
) -> Result<u64, JournalError> {
    // Keep the invalidation reservation until the reset is committed so a new
    // sync cannot start for this host between cancellation and deletion.
    let _deletion_guard = cancel_state.invalidate_host(&host_id)?;
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
pub async fn export_offline_logs(
    host_id: String,
    filter: JournalFilter,
    format: ExportFormat,
    path: String,
    state: State<'_, OfflineDatabaseState>,
) -> Result<u64, JournalError> {
    // Ensure the writable connection has finished initialization before opening
    // an independent read-only connection for the export snapshot.
    {
        let _db = state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;
    }

    let database_path = OfflineDatabase::path()?;


    tokio::task::spawn_blocking(move || {
        let db = OfflineDatabase::open_read_only(&database_path)?;
        match format {
            ExportFormat::Json => write_json(&db, &host_id, &filter, &path),
            ExportFormat::Text => write_text(&db, &host_id, &filter, &path),
            ExportFormat::Csv => write_csv(&db, &host_id, &filter, &path),
        }
    })
    .await
    .map_err(|e| JournalError::ExecutionError(format!("Export task failed: {}", e)))?
}

/// Stream a JSON array from a read-only database snapshot.
fn write_json(
    db: &OfflineDatabase,
    host_id: &str,
    filter: &JournalFilter,
    path: &str,
) -> Result<u64, JournalError> {
    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let mut writer = BufWriter::new(file);
    writer
        .write_all(b"[\n")
        .map_err(|e| JournalError::ExecutionError(format!("Failed to write JSON: {}", e)))?;

    let mut first = true;
    let count = db.visit_entries(host_id, filter, |entry| {
        if !first {
            writer
                .write_all(b",\n")
                .map_err(|e| JournalError::ExecutionError(format!("Failed to write JSON: {}", e)))?;
        }
        serde_json::to_writer(&mut writer, entry)
            .map_err(|e| JournalError::ExecutionError(format!("Failed to write JSON: {}", e)))?;
        first = false;
        Ok(())
    })?;

    writer
        .write_all(b"\n]\n")
        .and_then(|()| writer.flush())
        .map_err(|e| JournalError::ExecutionError(format!("Failed to flush JSON: {}", e)))?;
    Ok(count)
}

/// Stream human-readable entries from a read-only database snapshot.
fn write_text(
    db: &OfflineDatabase,
    host_id: &str,
    filter: &JournalFilter,
    path: &str,
) -> Result<u64, JournalError> {
    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let mut writer = BufWriter::new(file);
    let count = db.visit_entries(host_id, filter, |entry| write_text_entry(&mut writer, entry))?;

    writer
        .flush()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to flush file: {}", e)))?;
    Ok(count)
}

fn write_text_entry(writer: &mut BufWriter<File>, entry: &JournalEntry) -> Result<(), JournalError> {
    let timestamp = format_timestamp(entry.realtime_timestamp);
    let priority_label = priority_to_label(entry.priority);
    let unit = entry.systemd_unit.as_deref().unwrap_or("-");

    writeln!(
        writer,
        "[{}] [{}] [{}]: {}",
        timestamp, priority_label, unit, entry.message
    )
    .map_err(|e| JournalError::ExecutionError(format!("Failed to write text: {}", e)))
}

/// Stream CSV rows from a read-only database snapshot.
fn write_csv(
    db: &OfflineDatabase,
    host_id: &str,
    filter: &JournalFilter,
    path: &str,
) -> Result<u64, JournalError> {
    use crate::journal::csv::{write_csv_row, CsvCell};

    let file = File::create(path)
        .map_err(|e| JournalError::ExecutionError(format!("Failed to create file: {}", e)))?;
    let mut writer = BufWriter::new(file);
    write_csv_row(
        &mut writer,
        &[
            CsvCell::Text("timestamp"),
            CsvCell::Text("priority"),
            CsvCell::Text("unit"),
            CsvCell::Text("identifier"),
            CsvCell::Text("pid"),
            CsvCell::Text("message"),
        ],
    )
    .map_err(|e| JournalError::ExecutionError(format!("Failed to write CSV header: {}", e)))?;

    let count = db.visit_entries(host_id, filter, |entry| write_csv_entry(&mut writer, entry))?;
    writer
        .flush()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to flush file: {}", e)))?;
    Ok(count)
}

fn write_csv_entry(writer: &mut BufWriter<File>, entry: &JournalEntry) -> Result<(), JournalError> {
    use crate::journal::csv::{write_csv_row, CsvCell};

    let timestamp = format_timestamp_iso(entry.realtime_timestamp);
    let unit = entry.systemd_unit.as_deref().unwrap_or("");
    let identifier = entry.syslog_identifier.as_deref().unwrap_or("");
    let pid = entry
        .pid
        .map(|pid| CsvCell::Integer(i64::from(pid)))
        .unwrap_or(CsvCell::Empty);

    write_csv_row(
        writer,
        &[
            CsvCell::Text(&timestamp),
            CsvCell::Integer(i64::from(entry.priority)),
            CsvCell::Text(unit),
            CsvCell::Text(identifier),
            pid,
            CsvCell::Text(&entry.message),
        ],
    )
    .map_err(|e| JournalError::ExecutionError(format!("Failed to write CSV row: {}", e)))
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use tempfile::tempdir;

    fn sample_entry(index: usize) -> JournalEntry {
        JournalEntry {
            cursor: format!("cursor-{index}"),
            realtime_timestamp: index as i64,
            monotonic_timestamp: None,
            boot_id: "boot".to_string(),
            message: format!("message-{index}"),
            priority: 6,
            syslog_identifier: None,
            systemd_unit: None,
            pid: None,
            uid: None,
            gid: None,
            exe: None,
            cmdline: None,
            hostname: None,
            comm: None,
        }
    }

    #[test]
    fn export_writers_stream_every_matching_entry() {
        let directory = tempdir().unwrap();
        let database_path = directory.path().join("offline.db");
        let db = OfflineDatabase::from_connection(Connection::open(database_path).unwrap());
        db.run_migrations().unwrap();
        let entries = (0..501).map(sample_entry).collect::<Vec<_>>();
        assert_eq!(db.insert_entries("host", &entries).unwrap(), 501);

        let filter = JournalFilter {
            limit: 1,
            reverse: true,
            after_cursor: Some("cursor-500".to_string()),
            ..Default::default()
        };
        let json_path = directory.path().join("logs.json");
        assert_eq!(
            write_json(&db, "host", &filter, json_path.to_str().unwrap()).unwrap(),
            501
        );
        let json: Vec<JournalEntry> =
            serde_json::from_slice(&fs::read(&json_path).unwrap()).unwrap();
        assert_eq!(json.len(), 501);
        assert_eq!(json.first().unwrap().cursor, "cursor-0");

        let text_path = directory.path().join("logs.txt");
        assert_eq!(
            write_text(&db, "host", &filter, text_path.to_str().unwrap()).unwrap(),
            501
        );
        assert_eq!(fs::read_to_string(&text_path).unwrap().lines().count(), 501);

        let csv_path = directory.path().join("logs.csv");
        assert_eq!(
            write_csv(&db, "host", &filter, csv_path.to_str().unwrap()).unwrap(),
            501
        );
        assert_eq!(fs::read_to_string(&csv_path).unwrap().lines().count(), 502);
    }
}
