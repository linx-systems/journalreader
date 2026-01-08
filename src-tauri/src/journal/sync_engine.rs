//! Sync engine for boot-based synchronization of journal entries from remote hosts.
//!
//! This module implements the core sync logic that fetches entries from the last N boots
//! of remote hosts and stores them in the local SQLite database for offline access.

use crate::error::JournalError;
use crate::journal::offline_db::OfflineDatabase;
use crate::journal::offline_types::{SyncState, SyncStatus};
use crate::journal::remote_reader::RemoteJournalReader;
use crate::journal::ssh::ConnectionManager;
use crate::journal::types::JournalFilter;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

// Re-export retention types for convenience
pub use crate::journal::offline_types::{RetentionPolicy, RetentionResult};

/// Batch size for fetching entries within each boot
const SYNC_BATCH_SIZE: u32 = 1000;

/// Event payload for sync progress updates
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressEvent {
    /// Host ID being synced
    pub host_id: String,
    /// Current sync status
    pub status: SyncProgressStatus,
    /// Number of entries synced so far
    pub entries_synced: i64,
    /// Total entries synced for this host (cumulative)
    pub total_entries: i64,
    /// Number of entries in current batch
    pub batch_size: usize,
    /// Error message if status is "error"
    pub error: Option<String>,
}

/// Status types for sync progress events
#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncProgressStatus {
    /// Starting the sync process
    Starting,
    /// Currently fetching entries
    Fetching,
    /// Sync completed successfully
    Completed,
    /// Sync was cancelled
    Cancelled,
    /// Sync failed with an error
    Error,
}

/// Result of a sync operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    /// Host ID that was synced
    pub host_id: String,
    /// Whether sync completed successfully
    pub success: bool,
    /// Number of new entries synced
    pub entries_synced: i64,
    /// Total entries for this host after sync
    pub total_entries: i64,
    /// Error message if sync failed
    pub error: Option<String>,
    /// Whether sync was cancelled
    pub cancelled: bool,
}

/// Get current timestamp in milliseconds
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Sync engine for incremental journal synchronization
pub struct SyncEngine;

impl SyncEngine {
    /// Send a desktop notification for sync completion or failure.
    fn send_notification(app_handle: &AppHandle, title: &str, body: &str) {
        let _ = app_handle
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }

    /// Sync journal entries from a remote host.
    ///
    /// This method implements boot-based sync by:
    /// 1. Getting the list of available boots from the remote host
    /// 2. Selecting the last N boots based on settings
    /// 3. Fetching all entries from each boot in batches
    /// 4. Inserting entries into SQLite
    /// 5. Applying retention policy to clean up old boots
    ///
    /// # Arguments
    /// * `host_id` - The ID of the host to sync
    /// * `host_name` - Display name of the host (for notifications)
    /// * `conn` - The SSH connection manager
    /// * `db` - The offline database
    /// * `cancel_flag` - Atomic flag to cancel the sync
    /// * `app_handle` - Optional Tauri app handle for emitting events
    ///
    /// # Returns
    /// A `SyncResult` indicating the outcome of the sync operation
    pub fn sync_host(
        host_id: &str,
        host_name: &str,
        conn: &ConnectionManager,
        db: &OfflineDatabase,
        cancel_flag: Arc<AtomicBool>,
        app_handle: Option<&AppHandle>,
    ) -> SyncResult {
        // Check for cancellation before starting
        if cancel_flag.load(Ordering::SeqCst) {
            return SyncResult {
                host_id: host_id.to_string(),
                success: false,
                entries_synced: 0,
                total_entries: 0,
                error: None,
                cancelled: true,
            };
        }

        // Get offline settings to determine how many boots to sync
        let settings = match db.get_offline_settings() {
            Ok(s) => s,
            Err(e) => {
                return SyncResult {
                    host_id: host_id.to_string(),
                    success: false,
                    entries_synced: 0,
                    total_entries: 0,
                    error: Some(format!("Failed to get offline settings: {}", e)),
                    cancelled: false,
                };
            }
        };

        let boots_to_sync = settings.sync_boots;

        // Get initial sync state
        let mut sync_state = match db.get_sync_state(host_id) {
            Ok(state) => state,
            Err(e) => {
                return SyncResult {
                    host_id: host_id.to_string(),
                    success: false,
                    entries_synced: 0,
                    total_entries: 0,
                    error: Some(format!("Failed to get sync state: {}", e)),
                    cancelled: false,
                };
            }
        };

        // Emit starting event
        if let Some(handle) = app_handle {
            let _ = handle.emit(
                "sync-progress",
                SyncProgressEvent {
                    host_id: host_id.to_string(),
                    status: SyncProgressStatus::Starting,
                    entries_synced: 0,
                    total_entries: sync_state.entries_synced,
                    batch_size: 0,
                    error: None,
                },
            );
        }

        // Update sync state to in-progress
        sync_state.sync_status = SyncStatus::InProgress;
        sync_state.sync_error = None;
        if let Err(e) = db.update_sync_state(&sync_state) {
            return SyncResult {
                host_id: host_id.to_string(),
                success: false,
                entries_synced: 0,
                total_entries: sync_state.entries_synced,
                error: Some(format!("Failed to update sync state: {}", e)),
                cancelled: false,
            };
        }

        // Get list of available boots from remote
        let boots = match RemoteJournalReader::list_boots(conn) {
            Ok(b) => b,
            Err(e) => {
                sync_state.sync_status = SyncStatus::Failed;
                sync_state.sync_error = Some(format!("Failed to list boots: {}", e));
                let _ = db.update_sync_state(&sync_state);
                return SyncResult {
                    host_id: host_id.to_string(),
                    success: false,
                    entries_synced: 0,
                    total_entries: sync_state.entries_synced,
                    error: Some(format!("Failed to list boots: {}", e)),
                    cancelled: false,
                };
            }
        };

        // Select the last N boots (boots are already sorted by offset, 0 is current)
        // Take boots with offset >= -(boots_to_sync - 1)
        let boots_to_fetch: Vec<_> = boots
            .iter()
            .filter(|b| b.boot_offset >= -(boots_to_sync as i32 - 1))
            .collect();

        let mut entries_synced: i64 = 0;
        let mut sync_error: Option<String> = None;
        let mut was_cancelled = false;

        // Sync each boot
        for boot in &boots_to_fetch {
            // Check for cancellation
            if cancel_flag.load(Ordering::SeqCst) {
                was_cancelled = true;
                break;
            }

            let mut last_cursor: Option<String> = None;

            // Fetch all entries for this boot in batches
            loop {
                // Check for cancellation
                if cancel_flag.load(Ordering::SeqCst) {
                    was_cancelled = true;
                    break;
                }

                // Build filter for this batch
                let filter = JournalFilter {
                    boot_id: Some(boot.boot_id.clone()),
                    after_cursor: last_cursor.clone(),
                    limit: SYNC_BATCH_SIZE,
                    reverse: false, // Oldest first for proper ordering
                    ..Default::default()
                };

                // Fetch batch from remote
                let result = match RemoteJournalReader::query(conn, &filter) {
                    Ok(r) => r,
                    Err(e) => {
                        sync_error = Some(format!("Failed to fetch entries for boot {}: {}", boot.boot_id, e));
                        break;
                    }
                };

                // No more entries for this boot
                if result.entries.is_empty() {
                    break;
                }

                let batch_size = result.entries.len();

                // Insert entries into database
                match db.insert_entries(host_id, &result.entries) {
                    Ok(inserted) => {
                        entries_synced += inserted as i64;
                    }
                    Err(e) => {
                        sync_error = Some(format!("Failed to insert entries: {}", e));
                        break;
                    }
                }

                // Update cursor for next batch
                last_cursor = result.cursor_end.clone();

                // Update sync state
                sync_state.last_cursor = last_cursor.clone();
                sync_state.last_sync_timestamp = now_millis();
                sync_state.entries_synced += batch_size as i64;

                if let Err(e) = db.update_sync_state(&sync_state) {
                    sync_error = Some(format!("Failed to update sync state: {}", e));
                    break;
                }

                // Emit progress event
                if let Some(handle) = app_handle {
                    let _ = handle.emit(
                        "sync-progress",
                        SyncProgressEvent {
                            host_id: host_id.to_string(),
                            status: SyncProgressStatus::Fetching,
                            entries_synced,
                            total_entries: sync_state.entries_synced,
                            batch_size,
                            error: None,
                        },
                    );
                }

                // No more entries available for this boot
                if !result.has_more {
                    break;
                }
            }

            // Break outer loop if we hit an error or cancellation
            if sync_error.is_some() || was_cancelled {
                break;
            }
        }

        // Finalize sync state
        let final_status = if was_cancelled {
            SyncProgressStatus::Cancelled
        } else if sync_error.is_some() {
            SyncProgressStatus::Error
        } else {
            SyncProgressStatus::Completed
        };

        sync_state.sync_status = match final_status {
            SyncProgressStatus::Completed => SyncStatus::Completed,
            SyncProgressStatus::Cancelled => SyncStatus::InProgress, // Keep as in-progress for resume
            SyncProgressStatus::Error => SyncStatus::Failed,
            _ => SyncStatus::Failed,
        };
        sync_state.sync_error = sync_error.clone();
        sync_state.last_sync_timestamp = now_millis();

        // Best-effort update of final state
        let _ = db.update_sync_state(&sync_state);

        // Apply retention policy after successful sync
        let mut retention_deleted: u64 = 0;
        if final_status == SyncProgressStatus::Completed {
            if let Ok(policy) = db.get_retention_policy() {
                if let Ok(deleted) = db.apply_retention(host_id, &policy) {
                    retention_deleted = deleted;
                }
            }
        }

        // Emit final progress event
        if let Some(handle) = app_handle {
            let _ = handle.emit(
                "sync-progress",
                SyncProgressEvent {
                    host_id: host_id.to_string(),
                    status: final_status.clone(),
                    entries_synced,
                    total_entries: sync_state.entries_synced,
                    batch_size: 0,
                    error: sync_error.clone(),
                },
            );

            // Send desktop notification for completed or failed syncs
            match final_status {
                SyncProgressStatus::Completed => {
                    let message = if retention_deleted > 0 {
                        format!(
                            "{} entries synced from {} ({} old entries cleaned up)",
                            entries_synced, host_name, retention_deleted
                        )
                    } else {
                        format!("{} entries synced from {}", entries_synced, host_name)
                    };
                    Self::send_notification(handle, "Sync Complete", &message);
                }
                SyncProgressStatus::Error => {
                    let error_msg = sync_error
                        .as_ref()
                        .map(|e| e.as_str())
                        .unwrap_or("Unknown error");
                    Self::send_notification(handle, "Sync Failed", error_msg);
                }
                _ => {}
            }
        }

        SyncResult {
            host_id: host_id.to_string(),
            success: sync_error.is_none() && !was_cancelled,
            entries_synced,
            total_entries: sync_state.entries_synced,
            error: sync_error,
            cancelled: was_cancelled,
        }
    }

    /// Resume an interrupted sync for a host.
    ///
    /// This is equivalent to calling `sync_host` - it will automatically
    /// resume from the last saved cursor position.
    pub fn resume_sync(
        host_id: &str,
        host_name: &str,
        conn: &ConnectionManager,
        db: &OfflineDatabase,
        cancel_flag: Arc<AtomicBool>,
        app_handle: Option<&AppHandle>,
    ) -> SyncResult {
        // Resume is the same as sync - the cursor position is preserved
        Self::sync_host(host_id, host_name, conn, db, cancel_flag, app_handle)
    }

    /// Check if a sync can be resumed for a host.
    ///
    /// Returns true if there's a stored cursor position that can be resumed from.
    pub fn can_resume(host_id: &str, db: &OfflineDatabase) -> Result<bool, JournalError> {
        let state = db.get_sync_state(host_id)?;
        Ok(state.last_cursor.is_some()
            && (state.sync_status == SyncStatus::InProgress
                || state.sync_status == SyncStatus::Failed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::journal::known_hosts::new_shared_known_hosts_storage;
    use crate::journal::ssh::ConnectionManager;
    use crate::journal::types::JournalEntry;
    use rusqlite::Connection;
    use tempfile::tempdir;

    /// Helper to create a test database in a temporary directory
    fn create_test_db() -> (OfflineDatabase, tempfile::TempDir) {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let db_path = temp_dir.path().join("test_sync.db");

        let conn = Connection::open(&db_path).expect("Failed to open test database");
        let db = OfflineDatabase::from_connection(conn);
        db.run_migrations().expect("Failed to run migrations");

        (db, temp_dir)
    }

    fn create_test_connection_manager() -> ConnectionManager {
        let known_hosts = new_shared_known_hosts_storage().unwrap();
        ConnectionManager::new(known_hosts)
    }

    fn sample_entry(cursor: &str, message: &str, timestamp: i64) -> JournalEntry {
        JournalEntry {
            cursor: cursor.to_string(),
            realtime_timestamp: timestamp,
            monotonic_timestamp: Some(1000),
            boot_id: "boot-123".to_string(),
            message: message.to_string(),
            priority: 6,
            syslog_identifier: Some("test".to_string()),
            systemd_unit: Some("test.service".to_string()),
            pid: Some(1234),
            uid: Some(1000),
            gid: Some(1000),
            exe: Some("/usr/bin/test".to_string()),
            cmdline: Some("/usr/bin/test arg1".to_string()),
            hostname: Some("localhost".to_string()),
            comm: Some("test".to_string()),
        }
    }

    #[test]
    fn test_sync_progress_status_serialize() {
        let status = SyncProgressStatus::Fetching;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"fetching\"");

        let status = SyncProgressStatus::Completed;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"completed\"");
    }

    #[test]
    fn test_sync_progress_event_serialize() {
        let event = SyncProgressEvent {
            host_id: "host-1".to_string(),
            status: SyncProgressStatus::Fetching,
            entries_synced: 100,
            total_entries: 500,
            batch_size: 100,
            error: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"hostId\":\"host-1\""));
        assert!(json.contains("\"status\":\"fetching\""));
        assert!(json.contains("\"entriesSynced\":100"));
    }

    #[test]
    fn test_sync_result_serialize() {
        let result = SyncResult {
            host_id: "host-1".to_string(),
            success: true,
            entries_synced: 1000,
            total_entries: 5000,
            error: None,
            cancelled: false,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"hostId\":\"host-1\""));
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"entriesSynced\":1000"));
    }

    #[test]
    fn test_can_resume_no_sync_state() {
        let (db, _temp_dir) = create_test_db();

        // No sync state exists - can't resume
        let can_resume = SyncEngine::can_resume("host-1", &db).unwrap();
        assert!(!can_resume);
    }

    #[test]
    fn test_can_resume_with_cursor() {
        let (db, _temp_dir) = create_test_db();

        // Create a sync state with cursor
        let state = SyncState {
            host_id: "host-1".to_string(),
            last_cursor: Some("cursor-123".to_string()),
            sync_status: SyncStatus::InProgress,
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        // Can resume because there's a cursor and status is in_progress
        let can_resume = SyncEngine::can_resume("host-1", &db).unwrap();
        assert!(can_resume);
    }

    #[test]
    fn test_can_resume_completed_sync() {
        let (db, _temp_dir) = create_test_db();

        // Create a completed sync state
        let state = SyncState {
            host_id: "host-1".to_string(),
            last_cursor: Some("cursor-123".to_string()),
            sync_status: SyncStatus::Completed,
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        // Can't resume completed syncs - they just continue from where they left off
        let can_resume = SyncEngine::can_resume("host-1", &db).unwrap();
        assert!(!can_resume);
    }

    #[test]
    fn test_can_resume_failed_sync() {
        let (db, _temp_dir) = create_test_db();

        // Create a failed sync state
        let state = SyncState {
            host_id: "host-1".to_string(),
            last_cursor: Some("cursor-123".to_string()),
            sync_status: SyncStatus::Failed,
            sync_error: Some("Connection lost".to_string()),
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        // Can resume failed syncs
        let can_resume = SyncEngine::can_resume("host-1", &db).unwrap();
        assert!(can_resume);
    }

    #[test]
    fn test_sync_without_connection() {
        let (db, _temp_dir) = create_test_db();
        let conn = create_test_connection_manager();
        let cancel_flag = Arc::new(AtomicBool::new(false));

        // Sync without a connection should fail
        let result = SyncEngine::sync_host("host-1", "Test Host", &conn, &db, cancel_flag, None);

        assert!(!result.success);
        assert!(result.error.is_some());
        assert!(result.error.unwrap().contains("Not connected"));
    }

    #[test]
    fn test_sync_immediate_cancel() {
        let (db, _temp_dir) = create_test_db();
        let conn = create_test_connection_manager();
        let cancel_flag = Arc::new(AtomicBool::new(true)); // Already cancelled

        // Sync should stop immediately due to cancellation
        let result = SyncEngine::sync_host("host-1", "Test Host", &conn, &db, cancel_flag, None);

        assert!(!result.success);
        assert!(result.cancelled);
        assert_eq!(result.entries_synced, 0);
    }

    #[test]
    fn test_sync_state_transitions() {
        let (db, _temp_dir) = create_test_db();

        // Initial state should be Never
        let state = db.get_sync_state("host-1").unwrap();
        assert_eq!(state.sync_status, SyncStatus::Never);

        // After starting sync, state should be InProgress
        let state = SyncState {
            host_id: "host-1".to_string(),
            sync_status: SyncStatus::InProgress,
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        let state = db.get_sync_state("host-1").unwrap();
        assert_eq!(state.sync_status, SyncStatus::InProgress);
    }

    #[test]
    fn test_cursor_preservation() {
        let (db, _temp_dir) = create_test_db();

        // Insert some entries
        let entries = vec![
            sample_entry("cur1", "First message", 1000000),
            sample_entry("cur2", "Second message", 1001000),
            sample_entry("cur3", "Third message", 1002000),
        ];
        db.insert_entries("host-1", &entries).unwrap();

        // Update sync state with cursor
        let state = SyncState {
            host_id: "host-1".to_string(),
            last_cursor: Some("cur3".to_string()),
            sync_status: SyncStatus::Completed,
            entries_synced: 3,
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        // Verify cursor is preserved
        let state = db.get_sync_state("host-1").unwrap();
        assert_eq!(state.last_cursor, Some("cur3".to_string()));
        assert_eq!(state.entries_synced, 3);
    }
}
