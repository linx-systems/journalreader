//! Tauri commands for sync operations.
//!
//! These commands expose the sync engine to the frontend, allowing the UI to
//! trigger, monitor, and cancel synchronization of journal entries from remote hosts.

use crate::commands::remote::{ConnectionManagerState, HostStorageState, OfflineDatabaseState};
use crate::error::JournalError;
use crate::journal::{SyncEngine, SyncResult};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

/// The one process-wide synchronization reservation.
///
/// Its flag is separately Arc-backed so cancellation never waits for the
/// connection or database mutex held by the blocking worker.
pub struct SyncCancelState(Arc<Mutex<SyncActivity>>);

struct SyncActivity {
    active: Option<ActiveSync>,
    deleting_hosts: std::collections::HashSet<String>,
}

struct ActiveSync {
    host_ids: Vec<String>,
    cancel_flag: Arc<AtomicBool>,
}

pub(crate) struct SyncDeletionGuard {
    state: Arc<Mutex<SyncActivity>>,
    host_id: String,
}

struct SyncReservation {
    state: Arc<Mutex<SyncActivity>>,
    cancel_flag: Arc<AtomicBool>,
}

impl SyncCancelState {
    fn reserve(&self, host_ids: Vec<String>) -> Result<SyncReservation, JournalError> {
        let mut activity = self
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {e}")))?;
        if activity.active.is_some()
            || host_ids
                .iter()
                .any(|host_id| activity.deleting_hosts.contains(host_id))
        {
            return Err(JournalError::ExecutionError("A sync is already running.".to_string()));
        }
        let cancel_flag = Arc::new(AtomicBool::new(false));
        activity.active = Some(ActiveSync {
            host_ids,
            cancel_flag: cancel_flag.clone(),
        });
        Ok(SyncReservation {
            state: self.0.clone(),
            cancel_flag,
        })
    }

    pub(crate) fn invalidate_host(
        &self,
        host_id: &str,
    ) -> Result<SyncDeletionGuard, JournalError> {
        let mut activity = self
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {e}")))?;
        activity.deleting_hosts.insert(host_id.to_string());
        if let Some(run) = activity
            .active
            .as_ref()
            .filter(|run| run.host_ids.iter().any(|id| id == host_id))
        {
            run.cancel_flag.store(true, Ordering::SeqCst);
        }
        Ok(SyncDeletionGuard {
            state: self.0.clone(),
            host_id: host_id.to_string(),
        })
    }

    fn cancel_host(&self, host_id: &str) -> Result<(), JournalError> {
        let activity = self
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire cancel lock: {e}")))?;
        if let Some(run) = activity
            .active
            .as_ref()
            .filter(|run| run.host_ids.iter().any(|id| id == host_id))
        {
            run.cancel_flag.store(true, Ordering::SeqCst);
        }
        Ok(())
    }
}

impl SyncReservation {
    fn cancel_flag(&self) -> Arc<AtomicBool> {
        self.cancel_flag.clone()
    }
}

impl Drop for SyncReservation {
    fn drop(&mut self) {
        if let Ok(mut activity) = self.state.lock() {
            if activity
                .active
                .as_ref()
                .is_some_and(|run| Arc::ptr_eq(&run.cancel_flag, &self.cancel_flag))
            {
                activity.active = None;
            }
        }
    }
}

impl Drop for SyncDeletionGuard {
    fn drop(&mut self) {
        if let Ok(mut activity) = self.state.lock() {
            activity.deleting_hosts.remove(&self.host_id);
        }
    }
}

impl Default for SyncCancelState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(SyncActivity {
            active: None,
            deleting_hosts: std::collections::HashSet::new(),
        })))
    }
}

fn emit_completion(app_handle: &AppHandle, result: &SyncResult) {
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
}

#[tauri::command]
pub async fn trigger_sync(
    host_id: String,
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
    db_state: State<'_, OfflineDatabaseState>,
    cancel_state: State<'_, SyncCancelState>,
    app_handle: AppHandle,
) -> Result<SyncResult, JournalError> {
    let host_name = {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire host lock: {e}")))?;
        storage
            .get(&host_id)
            .map(|host| host.name.clone())
            .ok_or_else(|| JournalError::HostNotFound(host_id.clone()))?
    };
    let reservation = cancel_state.reserve(vec![host_id.clone()])?;
    let conn = conn_state.0.clone();
    let db = db_state.0.clone();
    let worker_host_id = host_id.clone();
    let worker_handle = app_handle.clone();
    let result = tokio::task::spawn_blocking(move || {
        let cancel_flag = reservation.cancel_flag();
        let _reservation = reservation;
        SyncEngine::sync_host(
            &worker_host_id,
            &host_name,
            &conn,
            &db,
            cancel_flag,
            Some(&worker_handle),
        )
    })
    .await
    .map_err(|e| JournalError::ExecutionError(format!("Sync task failed: {e}")))?;

    emit_completion(&app_handle, &result);
    Ok(result)
}

#[tauri::command]
pub async fn trigger_sync_all(
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
    db_state: State<'_, OfflineDatabaseState>,
    cancel_state: State<'_, SyncCancelState>,
    app_handle: AppHandle,
) -> Result<Vec<SyncResult>, JournalError> {
    let hosts = {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire host lock: {e}")))?;
        storage.list().to_vec()
    };
    let reservation = cancel_state.reserve(hosts.iter().map(|host| host.id.clone()).collect())?;
    let conn = conn_state.0.clone();
    let db = db_state.0.clone();
    let worker_handle = app_handle.clone();
    let results = tokio::task::spawn_blocking(move || {
        let cancel_flag = reservation.cancel_flag();
        let _reservation = reservation;
        hosts
            .iter()
            .map(|host| {
                SyncEngine::sync_host(
                    &host.id,
                    &host.name,
                    &conn,
                    &db,
                    cancel_flag.clone(),
                    Some(&worker_handle),
                )
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| JournalError::ExecutionError(format!("Sync task failed: {e}")))?;

    for result in &results {
        emit_completion(&app_handle, result);
    }
    Ok(results)
}

#[tauri::command]
pub fn cancel_sync(
    host_id: String,
    cancel_state: State<'_, SyncCancelState>,
) -> Result<(), JournalError> {
    cancel_state.cancel_host(&host_id)
}

#[tauri::command]
pub fn can_resume_sync(
    host_id: String,
    db_state: State<'_, OfflineDatabaseState>,
) -> Result<bool, JournalError> {
    let db = db_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(format!("Failed to acquire database lock: {e}")))?;
    SyncEngine::can_resume(&host_id, &db)
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrent_start_is_rejected_until_worker_reservation_drops() {
        let state = SyncCancelState::default();
        let reservation = state.reserve(vec!["host-a".into()]).unwrap();
        let error = match state.reserve(vec!["host-b".into()]) {
            Err(error) => error,
            Ok(_) => panic!("concurrent reservation unexpectedly succeeded"),
        };
        assert_eq!(
            error.to_string(),
            "Failed to execute journalctl: A sync is already running."
        );
        drop(reservation);
        assert!(state.reserve(vec!["host-b".into()]).is_ok());
    }

    #[test]
    fn each_reservation_gets_a_fresh_cancellation_flag() {
        let state = SyncCancelState::default();
        let first = state.reserve(vec!["host-a".into()]).unwrap();
        first.cancel_flag().store(true, Ordering::SeqCst);
        drop(first);
        let second = state.reserve(vec!["host-a".into()]).unwrap();
        assert!(!second.cancel_flag().load(Ordering::SeqCst));
    }

    #[test]
    fn cancellation_flag_is_arc_backed() {
        let state = SyncCancelState::default();
        let reservation = state.reserve(vec!["host-a".into()]).unwrap();
        let flag = reservation.cancel_flag();
        let flag_clone = flag.clone();
        std::thread::spawn(move || flag_clone.store(true, Ordering::SeqCst))
            .join()
            .unwrap();
        assert!(flag.load(Ordering::SeqCst));
    }

    #[test]
    fn deletion_invalidates_matching_sync_and_blocks_its_restart() {
        let state = SyncCancelState::default();
        let reservation = state.reserve(vec!["host-a".into()]).unwrap();
        let cancel_flag = reservation.cancel_flag();

        let deletion = state.invalidate_host("host-a").unwrap();

        assert!(cancel_flag.load(Ordering::SeqCst));
        assert!(state.reserve(vec!["host-a".into()]).is_err());
        drop(reservation);
        assert!(state.reserve(vec!["host-a".into()]).is_err());

        drop(deletion);
        assert!(state.reserve(vec!["host-a".into()]).is_ok());
    }
}
