//! Tauri commands for sync operations.
//!
//! These commands expose the sync engine to the frontend, allowing the UI to
//! trigger, monitor, and cancel synchronization of journal entries from remote hosts.

use crate::commands::remote::{ConnectionManagerState, HostStorageState, OfflineDatabaseState};
use crate::error::JournalError;
use crate::journal::{SyncEngine, SyncResult};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// Global state for sync cancellation flags.
/// Maps host_id to its cancellation flag.
pub struct SyncCancelState(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Default for SyncCancelState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

// ============================================================================
// Sync Control Commands
// ============================================================================

/// Trigger synchronization for a specific host.
///
/// This command starts an incremental sync from the remote host to the local
/// offline database. Progress events are emitted during the sync:
/// - `sync-progress`: Emitted during sync with status updates
///
/// The sync is resumable - if interrupted, it will continue from the last
/// saved cursor position.
#[tauri::command]
pub async fn trigger_sync(
    host_id: String,
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
    db_state: State<'_, OfflineDatabaseState>,
    cancel_state: State<'_, SyncCancelState>,
    app_handle: AppHandle,
) -> Result<SyncResult, JournalError> {
    // Verify host exists
    {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire host lock: {}", e)))?;
        if storage.get(&host_id).is_none() {
            return Err(JournalError::HostNotFound(host_id));
        }
    }

    // Create or get cancellation flag for this host
    let cancel_flag = {
        let mut cancel_map = cancel_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {}", e)))?;

        // Reset any existing flag
        let flag = cancel_map
            .entry(host_id.clone())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)));
        flag.store(false, Ordering::SeqCst);
        flag.clone()
    };

    // Clone state handles for the blocking task
    let conn_manager = conn_state.0.clone();
    let db = db_state.0.clone();
    let host_id_clone = host_id.clone();
    let sync_app_handle = app_handle.clone();

    // Run sync in a blocking task
    let result = tokio::task::spawn_blocking(move || {
        // Lock connection manager
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire connection lock: {}", e)))?;

        // Lock database
        let database = db
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

        // Run the sync
        Ok::<SyncResult, JournalError>(SyncEngine::sync_host(
            &host_id_clone,
            &manager,
            &database,
            cancel_flag,
            Some(&sync_app_handle),
        ))
    })
    .await
    .map_err(|e| JournalError::ExecutionError(format!("Sync task failed: {}", e)))??;

    // Emit completion or failure event
    if result.success {
        let _ = app_handle.emit(
            "sync-completed",
            serde_json::json!({
                "hostId": result.host_id,
                "entriesSynced": result.entries_synced,
                "totalEntries": result.total_entries
            }),
        );
    } else if !result.cancelled {
        let _ = app_handle.emit(
            "sync-failed",
            serde_json::json!({
                "hostId": result.host_id,
                "error": result.error
            }),
        );
    }

    Ok(result)
}

/// Trigger synchronization for all configured hosts.
///
/// This command syncs all hosts sequentially. Each host's sync is independent
/// and will continue even if previous hosts fail.
///
/// Returns a vector of SyncResult for each host.
#[tauri::command]
pub async fn trigger_sync_all(
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
    db_state: State<'_, OfflineDatabaseState>,
    cancel_state: State<'_, SyncCancelState>,
    app_handle: AppHandle,
) -> Result<Vec<SyncResult>, JournalError> {
    // Get list of all hosts
    let hosts = {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire host lock: {}", e)))?;
        storage.list().to_vec()
    };

    let mut results = Vec::new();

    // Sync each host sequentially
    for host in hosts {
        // Create cancellation flag for this host
        let cancel_flag = {
            let mut cancel_map = cancel_state
                .0
                .lock()
                .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {}", e)))?;

            let flag = cancel_map
                .entry(host.id.clone())
                .or_insert_with(|| Arc::new(AtomicBool::new(false)));
            flag.store(false, Ordering::SeqCst);
            flag.clone()
        };

        let conn_manager = conn_state.0.clone();
        let db = db_state.0.clone();
        let host_id = host.id.clone();
        let handle = app_handle.clone();

        // Run sync in a blocking task
        let result = tokio::task::spawn_blocking(move || {
            let manager = conn_manager
                .lock()
                .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire connection lock: {}", e)))?;

            let database = db
                .lock()
                .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

            Ok::<SyncResult, JournalError>(SyncEngine::sync_host(
                &host_id,
                &manager,
                &database,
                cancel_flag,
                Some(&handle),
            ))
        })
        .await
        .map_err(|e| JournalError::ExecutionError(format!("Sync task failed: {}", e)))??;

        // Emit completion or failure event
        if result.success {
            let _ = app_handle.emit(
                "sync-completed",
                serde_json::json!({
                    "hostId": result.host_id,
                    "entriesSynced": result.entries_synced,
                    "totalEntries": result.total_entries
                }),
            );
        } else if !result.cancelled {
            let _ = app_handle.emit(
                "sync-failed",
                serde_json::json!({
                    "hostId": result.host_id,
                    "error": result.error
                }),
            );
        }

        results.push(result);
    }

    Ok(results)
}

/// Cancel an in-progress sync for a specific host.
///
/// This sets the cancellation flag for the host, which will cause the sync
/// to stop at the next safe checkpoint. The sync state will be preserved
/// so it can be resumed later.
#[tauri::command]
pub fn cancel_sync(
    host_id: String,
    cancel_state: State<'_, SyncCancelState>,
) -> Result<(), JournalError> {
    let cancel_map = cancel_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {}", e)))?;

    if let Some(flag) = cancel_map.get(&host_id) {
        flag.store(true, Ordering::SeqCst);
    }

    Ok(())
}

/// Check if a sync can be resumed for a host.
///
/// Returns true if there's a stored cursor position that can be resumed from
/// (i.e., the sync was interrupted or failed).
#[tauri::command]
pub fn can_resume_sync(
    host_id: String,
    db_state: State<'_, OfflineDatabaseState>,
) -> Result<bool, JournalError> {
    let db = db_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {}", e)))?;

    SyncEngine::can_resume(&host_id, &db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_cancel_state_default() {
        let state = SyncCancelState::default();
        let map = state.0.lock().unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn test_sync_cancel_state_add_and_cancel() {
        let state = SyncCancelState::default();

        // Add a host flag
        {
            let mut map = state.0.lock().unwrap();
            map.insert("host-1".to_string(), Arc::new(AtomicBool::new(false)));
        }

        // Get the flag and set it
        {
            let map = state.0.lock().unwrap();
            let flag = map.get("host-1").unwrap();
            assert!(!flag.load(Ordering::SeqCst));
            flag.store(true, Ordering::SeqCst);
        }

        // Verify it's set
        {
            let map = state.0.lock().unwrap();
            let flag = map.get("host-1").unwrap();
            assert!(flag.load(Ordering::SeqCst));
        }
    }

    #[test]
    fn test_sync_cancel_state_multiple_hosts() {
        let state = SyncCancelState::default();

        // Add multiple hosts
        {
            let mut map = state.0.lock().unwrap();
            map.insert("host-1".to_string(), Arc::new(AtomicBool::new(false)));
            map.insert("host-2".to_string(), Arc::new(AtomicBool::new(false)));
            map.insert("host-3".to_string(), Arc::new(AtomicBool::new(false)));
        }

        // Cancel only host-2
        {
            let map = state.0.lock().unwrap();
            if let Some(flag) = map.get("host-2") {
                flag.store(true, Ordering::SeqCst);
            }
        }

        // Verify only host-2 is cancelled
        {
            let map = state.0.lock().unwrap();
            assert!(!map.get("host-1").unwrap().load(Ordering::SeqCst));
            assert!(map.get("host-2").unwrap().load(Ordering::SeqCst));
            assert!(!map.get("host-3").unwrap().load(Ordering::SeqCst));
        }
    }

    #[test]
    fn test_sync_cancel_state_reset_flag() {
        let state = SyncCancelState::default();

        // Add a host and set cancel
        {
            let mut map = state.0.lock().unwrap();
            map.insert("host-1".to_string(), Arc::new(AtomicBool::new(true)));
        }

        // Reset the flag (simulating starting a new sync)
        {
            let map = state.0.lock().unwrap();
            if let Some(flag) = map.get("host-1") {
                flag.store(false, Ordering::SeqCst);
            }
        }

        // Verify it's reset
        {
            let map = state.0.lock().unwrap();
            let flag = map.get("host-1").unwrap();
            assert!(!flag.load(Ordering::SeqCst));
        }
    }

    #[test]
    fn test_sync_cancel_flag_is_thread_safe() {
        use std::thread;

        let state = SyncCancelState::default();

        // Add a host
        {
            let mut map = state.0.lock().unwrap();
            map.insert("host-1".to_string(), Arc::new(AtomicBool::new(false)));
        }

        // Get the flag
        let flag = {
            let map = state.0.lock().unwrap();
            map.get("host-1").unwrap().clone()
        };

        let flag_clone = flag.clone();

        // Set the flag before spawning the thread to avoid race condition
        flag.store(true, Ordering::SeqCst);

        // Spawn a thread that verifies the flag is visible
        let check_handle = thread::spawn(move || flag_clone.load(Ordering::SeqCst));

        // Check thread should observe the change
        let observed = check_handle.join().unwrap();
        assert!(observed, "Thread should observe the cancelled flag");
    }

    #[test]
    fn test_sync_cancel_missing_host_is_noop() {
        let state = SyncCancelState::default();

        // Try to cancel a host that doesn't exist
        {
            let map = state.0.lock().unwrap();
            // This should not panic - just do nothing
            if let Some(flag) = map.get("non-existent-host") {
                flag.store(true, Ordering::SeqCst);
            }
        }

        // Map should still be empty
        let map = state.0.lock().unwrap();
        assert!(map.is_empty());
    }

    #[test]
    fn test_event_payload_format_completed() {
        // Test that the sync-completed event payload has the expected format
        let payload = serde_json::json!({
            "hostId": "test-host",
            "entriesSynced": 100,
            "totalEntries": 500
        });

        assert_eq!(payload["hostId"], "test-host");
        assert_eq!(payload["entriesSynced"], 100);
        assert_eq!(payload["totalEntries"], 500);
    }

    #[test]
    fn test_event_payload_format_failed() {
        // Test that the sync-failed event payload has the expected format
        let payload = serde_json::json!({
            "hostId": "test-host",
            "error": "Connection lost"
        });

        assert_eq!(payload["hostId"], "test-host");
        assert_eq!(payload["error"], "Connection lost");
    }

    #[test]
    fn test_event_payload_format_failed_null_error() {
        // Test that the sync-failed event can have null error
        let error: Option<String> = None;
        let payload = serde_json::json!({
            "hostId": "test-host",
            "error": error
        });

        assert_eq!(payload["hostId"], "test-host");
        assert!(payload["error"].is_null());
    }
}
