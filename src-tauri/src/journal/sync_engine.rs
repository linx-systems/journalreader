//! Sync engine for boot-based synchronization of journal entries from remote hosts.
//!
//! This module implements the core sync logic that fetches entries from the last N boots
//! of remote hosts and stores them in the local SQLite database for offline access.

use crate::error::JournalError;
use crate::journal::offline_db::{OfflineDatabase, SharedOfflineDatabase};
use crate::journal::offline_types::SyncStatus;
use crate::journal::remote_reader::RemoteJournalReader;
use crate::journal::ssh::SharedConnectionManager;
use crate::journal::types::{BootInfo, JournalFilter, JournalQueryResult};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;


/// Batch size for fetching entries within each boot
const SYNC_BATCH_SIZE: u32 = 1000;

/// Host-scoped source for synchronization.
///
/// Each operation is intentionally independent so the source lock is released
/// before the engine acquires the offline database lock.
pub trait SyncSource {
    fn list_boots(&self, host_id: &str) -> Result<Vec<BootInfo>, JournalError>;
    fn query(&self, host_id: &str, filter: &JournalFilter) -> Result<JournalQueryResult, JournalError>;
}

fn source_changed_error() -> JournalError {
    JournalError::ExecutionError("Sync source changed; reconnect the requested host.".to_string())
}

impl SyncSource for SharedConnectionManager {
    fn list_boots(&self, host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
        let manager = self
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire connection lock: {e}")))?;
        if manager.current_host().map(|host| host.id.as_str()) != Some(host_id) {
            return Err(source_changed_error());
        }
        RemoteJournalReader::list_boots(&manager)
    }

    fn query(&self, host_id: &str, filter: &JournalFilter) -> Result<JournalQueryResult, JournalError> {
        let manager = self
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire connection lock: {e}")))?;
        if manager.current_host().map(|host| host.id.as_str()) != Some(host_id) {
            return Err(source_changed_error());
        }
        RemoteJournalReader::query(&manager, filter)
    }
}

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

    fn lock_database(
        shared_db: &SharedOfflineDatabase,
    ) -> Result<std::sync::MutexGuard<'_, OfflineDatabase>, JournalError> {
        shared_db
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {e}")))
    }

    /// Persist a terminal state after the caller has acquired the database
    /// guard. Cancellation is checked here because it can arrive while the
    /// worker waits for that guard.
    fn persist_terminal_state_after_lock(
        db: &OfflineDatabase,
        cancel_flag: &AtomicBool,
        sync_state: &mut crate::journal::offline_types::SyncState,
        final_status: SyncProgressStatus,
    ) -> Result<SyncProgressStatus, JournalError> {
        if cancel_flag.load(Ordering::SeqCst) {
            let mut current_state = db.get_sync_state(&sync_state.host_id)?;
            current_state.sync_status = SyncStatus::Never;
            current_state.sync_error = None;
            db.update_sync_state(&current_state)?;
            *sync_state = current_state;
            return Ok(SyncProgressStatus::Cancelled);
        }

        sync_state.sync_status = match final_status {
            SyncProgressStatus::Completed => SyncStatus::Completed,
            SyncProgressStatus::Error => SyncStatus::Failed,
            _ => SyncStatus::Failed,
        };
        sync_state.last_sync_timestamp = now_millis();
        db.update_sync_state(sync_state)?;
        Ok(final_status)
    }

    fn finalize_sync(
        host_id: &str,
        host_name: &str,
        shared_db: &SharedOfflineDatabase,
        cancel_flag: &AtomicBool,
        app_handle: Option<&AppHandle>,
        sync_state: &mut crate::journal::offline_types::SyncState,
        entries_synced: i64,
        mut final_status: SyncProgressStatus,
        mut sync_error: Option<String>,
    ) -> SyncResult {
        sync_state.sync_error = sync_error.clone();
        if let Ok(db) = Self::lock_database(shared_db) {
            if let Ok(status) = Self::persist_terminal_state_after_lock(
                &db,
                cancel_flag,
                sync_state,
                final_status.clone(),
            ) {
                final_status = status;
            }
        }
        let was_cancelled = final_status == SyncProgressStatus::Cancelled;
        if was_cancelled {
            sync_error = None;
            sync_state.sync_status = SyncStatus::Never;
            sync_state.sync_error = None;
        }

        let mut retention_deleted = 0;
        if final_status == SyncProgressStatus::Completed {
            if let Ok(db) = Self::lock_database(shared_db) {
                if let Ok(policy) = db.get_retention_policy() {
                    if let Ok(deleted) = db.apply_retention(host_id, &policy) {
                        retention_deleted = deleted;
                    }
                }
            }
        }

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
            match final_status {
                SyncProgressStatus::Completed => {
                    let message = if retention_deleted > 0 {
                        format!(
                            "{entries_synced} entries synced from {host_name} ({retention_deleted} old entries cleaned up)"
                        )
                    } else {
                        format!("{entries_synced} entries synced from {host_name}")
                    };
                    Self::send_notification(handle, "Sync Complete", &message);
                }
                SyncProgressStatus::Error => Self::send_notification(
                    handle,
                    "Sync Failed",
                    sync_error.as_deref().unwrap_or("Unknown error"),
                ),
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

    /// Synchronize a host without holding a source or database mutex across
    /// the other resource's work.
    pub fn sync_host(
        host_id: &str,
        host_name: &str,
        source: &impl SyncSource,
        shared_db: &SharedOfflineDatabase,
        cancel_flag: Arc<AtomicBool>,
        app_handle: Option<&AppHandle>,
    ) -> SyncResult {
        let result = |error: Option<String>, cancelled: bool, entries_synced: i64, total_entries: i64| SyncResult {
            host_id: host_id.to_string(),
            success: error.is_none() && !cancelled,
            entries_synced,
            total_entries,
            error,
            cancelled,
        };

        if cancel_flag.load(Ordering::SeqCst) {
            return result(None, true, 0, 0);
        }

        let settings = match Self::lock_database(shared_db).and_then(|db| db.get_offline_settings()) {
            Ok(settings) => settings,
            Err(error) => return result(Some(format!("Failed to get offline settings: {error}")), false, 0, 0),
        };
        let mut sync_state = match Self::lock_database(shared_db).and_then(|db| db.get_sync_state(host_id)) {
            Ok(state) => state,
            Err(error) => return result(Some(format!("Failed to get sync state: {error}")), false, 0, 0),
        };

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

        sync_state.sync_status = SyncStatus::InProgress;
        sync_state.sync_error = None;
        let sync_started = match Self::lock_database(shared_db).and_then(|db| {
            if cancel_flag.load(Ordering::SeqCst) {
                return Ok(false);
            }
            db.update_sync_state(&sync_state)?;
            Ok(true)
        }) {
            Ok(sync_started) => sync_started,
            Err(error) => {
                return result(
                    Some(format!("Failed to update sync state: {error}")),
                    false,
                    0,
                    sync_state.entries_synced,
                )
            }
        };
        if !sync_started {
            return result(None, true, 0, sync_state.entries_synced);
        }

        let boots = match source.list_boots(host_id) {
            Ok(boots) => boots,
            Err(error) => {
                let final_status = if cancel_flag.load(Ordering::SeqCst) {
                    SyncProgressStatus::Cancelled
                } else {
                    SyncProgressStatus::Error
                };
                return Self::finalize_sync(
                    host_id,
                    host_name,
                    shared_db,
                    &cancel_flag,
                    app_handle,
                    &mut sync_state,
                    0,
                    final_status,
                    Some(format!("Failed to list boots: {error}")),
                );
            }
        };
        if cancel_flag.load(Ordering::SeqCst) {
            return Self::finalize_sync(
                host_id,
                host_name,
                shared_db,
                &cancel_flag,
                app_handle,
                &mut sync_state,
                0,
                SyncProgressStatus::Cancelled,
                None,
            );
        }
        let boots_to_fetch: Vec<_> = boots
            .iter()
            .filter(|boot| boot.boot_offset >= -(settings.sync_boots as i32 - 1))
            .collect();
        let mut entries_synced = 0_i64;
        let mut sync_error = None;
        let mut was_cancelled = false;

        for boot in boots_to_fetch {
            if cancel_flag.load(Ordering::SeqCst) {
                was_cancelled = true;
                break;
            }

            let mut last_cursor = None;
            loop {
                if cancel_flag.load(Ordering::SeqCst) {
                    was_cancelled = true;
                    break;
                }

                let filter = JournalFilter {
                    boot_id: Some(boot.boot_id.clone()),
                    after_cursor: last_cursor.clone(),
                    limit: SYNC_BATCH_SIZE,
                    reverse: false,
                    ..Default::default()
                };
                let page = match source.query(host_id, &filter) {
                    Ok(page) => page,
                    Err(error) => {
                        sync_error = Some(format!(
                            "Failed to fetch entries for boot {}: {error}",
                            boot.boot_id
                        ));
                        break;
                    }
                };
                if page.entries.is_empty() {
                    break;
                }
                // The network query may have blocked; cancellation wins before
                // the database transaction begins.
                if cancel_flag.load(Ordering::SeqCst) {
                    was_cancelled = true;
                    break;
                }

                let batch_size = page.entries.len();
                match Self::lock_database(shared_db).and_then(|db| {
                    // This must be checked after obtaining the guard: a
                    // cancellation or cache deletion may have happened while
                    // waiting for another database operation.
                    if cancel_flag.load(Ordering::SeqCst) {
                        return Ok(None);
                    }
                    db.insert_sync_batch(host_id, &page.entries, &mut sync_state)
                        .map(Some)
                }) {
                    Ok(Some(inserted)) => entries_synced += inserted as i64,
                    Ok(None) => {
                        was_cancelled = true;
                        break;
                    }
                    Err(error) => {
                        sync_error = Some(format!("Failed to insert entries: {error}"));
                        break;
                    }
                }
                last_cursor = page.cursor_end;

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
                if !page.has_more {
                    break;
                }
            }
            if sync_error.is_some() || was_cancelled {
                break;
            }
        }

        if cancel_flag.load(Ordering::SeqCst) {
            was_cancelled = true;
        }
        let final_status = if was_cancelled {
            SyncProgressStatus::Cancelled
        } else if sync_error.is_some() {
            SyncProgressStatus::Error
        } else {
            SyncProgressStatus::Completed
        };
        Self::finalize_sync(
            host_id,
            host_name,
            shared_db,
            &cancel_flag,
            app_handle,
            &mut sync_state,
            entries_synced,
            final_status,
            sync_error,
        )
    }

    /// Check whether a stored checkpoint can be resumed.
    pub fn can_resume(
        host_id: &str,
        db: &crate::journal::offline_db::OfflineDatabase,
    ) -> Result<bool, JournalError> {
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
    use crate::journal::offline_types::SyncState;
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

    struct BlockingSource {
        started: std::sync::mpsc::Sender<()>,
        release: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
    }

    impl SyncSource for BlockingSource {
        fn list_boots(&self, _host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
            self.started
                .send(())
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            let release = self
                .release
                .lock()
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            release
                .recv()
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            Ok(Vec::new())
        }

        fn query(
            &self,
            _host_id: &str,
            _filter: &JournalFilter,
        ) -> Result<JournalQueryResult, JournalError> {
            unreachable!("no boots means no query")
        }
    }

    struct CancellingListBootsSource {
        cancel: Arc<AtomicBool>,
        error: bool,
    }

    impl SyncSource for CancellingListBootsSource {
        fn list_boots(&self, _host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
            self.cancel.store(true, Ordering::SeqCst);
            if self.error {
                Err(JournalError::ExecutionError("list boots failed".to_string()))
            } else {
                Ok(Vec::new())
            }
        }

        fn query(
            &self,
            _host_id: &str,
            _filter: &JournalFilter,
        ) -> Result<JournalQueryResult, JournalError> {
            unreachable!("cancellation after listing boots must finish before querying")
        }
    }

    struct HostChangingSource {
        queries: std::sync::atomic::AtomicUsize,
    }

    impl SyncSource for HostChangingSource {
        fn list_boots(&self, _host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
            Ok(vec![BootInfo {
                boot_id: "boot-123".to_string(),
                boot_offset: 0,
                first_entry: None,
                last_entry: None,
            }])
        }

        fn query(
            &self,
            _host_id: &str,
            _filter: &JournalFilter,
        ) -> Result<JournalQueryResult, JournalError> {
            if self.queries.fetch_add(1, Ordering::SeqCst) == 0 {
                Ok(JournalQueryResult {
                    entries: vec![sample_entry("cur1", "first", 1)],
                    has_more: true,
                    cursor_start: Some("cur1".to_string()),
                    cursor_end: Some("cur1".to_string()),
                })
            } else {
                Err(source_changed_error())
            }
        }
    }

    struct CancellingSecondPageSource {
        queries: std::sync::atomic::AtomicUsize,
        cancel: Arc<AtomicBool>,
    }

    impl SyncSource for CancellingSecondPageSource {
        fn list_boots(&self, _host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
            Ok(vec![BootInfo {
                boot_id: "boot-123".to_string(),
                boot_offset: 0,
                first_entry: None,
                last_entry: None,
            }])
        }

        fn query(
            &self,
            _host_id: &str,
            _filter: &JournalFilter,
        ) -> Result<JournalQueryResult, JournalError> {
            let second_page = self.queries.fetch_add(1, Ordering::SeqCst) != 0;
            if second_page {
                self.cancel.store(true, Ordering::SeqCst);
            }
            let cursor = if second_page { "cur2" } else { "cur1" };
            Ok(JournalQueryResult {
                entries: vec![sample_entry(cursor, "entry", if second_page { 2 } else { 1 })],
                has_more: !second_page,
                cursor_start: Some(cursor.to_string()),
                cursor_end: Some(cursor.to_string()),
            })
        }
    }

    struct WaitingOnePageSource {
        queried: std::sync::mpsc::Sender<()>,
        release: std::sync::Mutex<std::sync::mpsc::Receiver<()>>,
    }

    impl SyncSource for WaitingOnePageSource {
        fn list_boots(&self, _host_id: &str) -> Result<Vec<BootInfo>, JournalError> {
            Ok(vec![BootInfo {
                boot_id: "boot-123".to_string(),
                boot_offset: 0,
                first_entry: None,
                last_entry: None,
            }])
        }

        fn query(
            &self,
            _host_id: &str,
            _filter: &JournalFilter,
        ) -> Result<JournalQueryResult, JournalError> {
            self.queried
                .send(())
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            self.release
                .lock()
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?
                .recv()
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            Ok(JournalQueryResult {
                entries: vec![sample_entry("stale", "stale", 2)],
                has_more: false,
                cursor_start: Some("stale".to_string()),
                cursor_end: Some("stale".to_string()),
            })
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
        let source = Arc::new(std::sync::Mutex::new(create_test_connection_manager()));
        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(false));

        let result =
            SyncEngine::sync_host("host-1", "Test Host", &source, &db, cancel_flag, None);

        assert!(!result.success);
        assert!(
            result
                .error
                .as_deref()
                .is_some_and(|error| error.contains("Sync source changed; reconnect the requested host."))
        );
    }

    #[test]
    fn cancellation_after_successful_boot_listing_persists_terminal_state() {
        let (db, _temp_dir) = create_test_db();
        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let source = CancellingListBootsSource {
            cancel: cancel_flag.clone(),
            error: false,
        };

        let result =
            SyncEngine::sync_host("host-1", "Test Host", &source, &db, cancel_flag, None);

        assert!(result.cancelled);
        assert!(!result.success);
        assert!(result.error.is_none());
        let state = db.lock().unwrap().get_sync_state("host-1").unwrap();
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert!(state.sync_error.is_none());
    }

    #[test]
    fn cancellation_after_failed_boot_listing_persists_terminal_state() {
        let (db, _temp_dir) = create_test_db();
        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let source = CancellingListBootsSource {
            cancel: cancel_flag.clone(),
            error: true,
        };

        let result =
            SyncEngine::sync_host("host-1", "Test Host", &source, &db, cancel_flag, None);

        assert!(result.cancelled);
        assert!(!result.success);
        assert!(result.error.is_none());
        let state = db.lock().unwrap().get_sync_state("host-1").unwrap();
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert!(state.sync_error.is_none());
    }

    #[test]
    fn test_sync_immediate_cancel() {
        let (db, _temp_dir) = create_test_db();
        let source = Arc::new(std::sync::Mutex::new(create_test_connection_manager()));
        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(true));

        let result =
            SyncEngine::sync_host("host-1", "Test Host", &source, &db, cancel_flag, None);

        assert!(!result.success);
        assert!(result.cancelled);
        assert_eq!(result.entries_synced, 0);
    }

    #[test]
    fn blocked_source_does_not_block_cached_reads() {
        let (db, _temp_dir) = create_test_db();
        db.insert_entries("host-1", &[sample_entry("cached", "cached", 1)])
            .unwrap();
        let db = Arc::new(std::sync::Mutex::new(db));
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let source = BlockingSource {
            started: started_tx,
            release: std::sync::Mutex::new(release_rx),
        };

        std::thread::scope(|scope| {
            let worker = scope.spawn(|| {
                SyncEngine::sync_host(
                    "host-1",
                    "Host",
                    &source,
                    &db,
                    Arc::new(AtomicBool::new(false)),
                    None,
                )
            });
            started_rx.recv().unwrap();
            let (cached_entries, cached_stats) = match db.lock() {
                Ok(db) => (
                    db.query_page("host-1", &JournalFilter::default())
                        .unwrap()
                        .entries
                        .len(),
                    db.get_storage_stats("host-1").unwrap().entry_count,
                ),
                Err(error) => panic!("database lock poisoned: {error}"),
            };
            assert_eq!(cached_entries, 1);
            assert_eq!(cached_stats, 1);
            release_tx.send(()).unwrap();
            assert!(worker.join().unwrap().success);
        });
    }

    #[test]
    fn source_change_between_batches_does_not_cross_label_entries() {
        let (db, _temp_dir) = create_test_db();
        let db = Arc::new(std::sync::Mutex::new(db));
        let source = HostChangingSource {
            queries: std::sync::atomic::AtomicUsize::new(0),
        };

        let result = SyncEngine::sync_host(
            "host-a",
            "Host A",
            &source,
            &db,
            Arc::new(AtomicBool::new(false)),
            None,
        );

        assert!(!result.success);
        assert!(
            result
                .error
                .as_deref()
                .is_some_and(|error| error.contains("Sync source changed; reconnect the requested host."))
        );
        let (host_a, host_b) = match db.lock() {
            Ok(db) => (
                db.get_storage_stats("host-a").unwrap().entry_count,
                db.get_storage_stats("host-b").unwrap().entry_count,
            ),
            Err(error) => panic!("database lock poisoned: {error}"),
        };
        assert_eq!(host_a, 1);
        assert_eq!(host_b, 0);
    }

    #[test]
    fn cancellation_after_network_return_keeps_last_checkpoint() {
        let (db, _temp_dir) = create_test_db();
        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let source = CancellingSecondPageSource {
            queries: std::sync::atomic::AtomicUsize::new(0),
            cancel: cancel_flag.clone(),
        };

        let result = SyncEngine::sync_host("host-a", "Host A", &source, &db, cancel_flag, None);

        assert!(result.cancelled);
        assert!(!result.success);
        let state = match db.lock() {
            Ok(db) => db.get_sync_state("host-a").unwrap(),
            Err(error) => panic!("database lock poisoned: {error}"),
        };
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert_eq!(state.last_cursor.as_deref(), Some("cur1"));
        assert_eq!(state.entries_synced, 1);
    }

    #[test]
    fn cancellation_observed_after_final_lock_persists_never_status() {
        let (db, _temp_dir) = create_test_db();
        let mut state = SyncState {
            host_id: "host-a".to_string(),
            last_cursor: Some("checkpoint".to_string()),
            sync_status: SyncStatus::InProgress,
            entries_synced: 1,
            ..Default::default()
        };
        db.update_sync_state(&state).unwrap();

        // The final status was already selected as completed before waiting
        // for the database guard. The cancellation is observed with that
        // guard held by persist_terminal_state_after_lock.
        let cancelled = AtomicBool::new(true);
        let final_status = SyncEngine::persist_terminal_state_after_lock(
            &db,
            &cancelled,
            &mut state,
            SyncProgressStatus::Completed,
        )
        .unwrap();

        assert!(final_status == SyncProgressStatus::Cancelled);
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert!(state.sync_error.is_none());
        let stored = db.get_sync_state("host-a").unwrap();
        assert_eq!(stored.sync_status, SyncStatus::Never);
        assert_eq!(stored.last_cursor.as_deref(), Some("checkpoint"));
        assert_eq!(stored.entries_synced, 1);
    }

    #[test]
    fn cancellation_while_waiting_for_database_lock_does_not_commit_stale_batch() {
        let (db, _temp_dir) = create_test_db();
        db.insert_entries("host-a", &[sample_entry("committed", "committed", 1)])
            .unwrap();
        db.update_sync_state(&SyncState {
            host_id: "host-a".to_string(),
            last_cursor: Some("committed".to_string()),
            sync_status: SyncStatus::Completed,
            entries_synced: 1,
            ..Default::default()
        })
        .unwrap();

        let db = Arc::new(std::sync::Mutex::new(db));
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let (queried_tx, queried_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let source = WaitingOnePageSource {
            queried: queried_tx,
            release: std::sync::Mutex::new(release_rx),
        };

        let result = std::thread::scope(|scope| {
            let worker = scope.spawn(|| {
                SyncEngine::sync_host(
                    "host-a",
                    "Host A",
                    &source,
                    &db,
                    cancel_flag.clone(),
                    None,
                )
            });
            queried_rx.recv().unwrap();

            let database = db.lock().unwrap();
            release_tx.send(()).unwrap();
            cancel_flag.store(true, Ordering::SeqCst);
            database.delete_all_entries("host-a").unwrap();
            database
                .update_sync_state(&SyncState {
                    host_id: "host-a".to_string(),
                    sync_status: SyncStatus::Never,
                    ..Default::default()
                })
                .unwrap();
            drop(database);

            worker.join().unwrap()
        });

        assert!(result.cancelled);
        let database = db.lock().unwrap();
        assert_eq!(database.get_storage_stats("host-a").unwrap().entry_count, 0);
        let state = database.get_sync_state("host-a").unwrap();
        assert_eq!(state.sync_status, SyncStatus::Never);
        assert!(state.last_cursor.is_none());
        assert_eq!(state.entries_synced, 0);
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
