use crate::error::JournalError;
use crate::journal::{
    BootInfo, JournalFilter, JournalFollower, JournalQueryResult, JournalReader, JournalStatistics,
    StatisticsRequest, SystemUnit,
};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

/// Global state for the journal follower
pub struct FollowerState(pub Arc<Mutex<JournalFollower>>);

#[tauri::command]
pub async fn query_journal(filter: JournalFilter) -> Result<JournalQueryResult, JournalError> {
    tokio::task::spawn_blocking(move || JournalReader::query(&filter))
        .await
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn list_units() -> Result<Vec<SystemUnit>, JournalError> {
    tokio::task::spawn_blocking(JournalReader::list_units)
        .await
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn list_boots() -> Result<Vec<BootInfo>, JournalError> {
    tokio::task::spawn_blocking(JournalReader::list_boots)
        .await
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn get_log_count(filter: JournalFilter) -> Result<u64, JournalError> {
    tokio::task::spawn_blocking(move || JournalReader::count(&filter))
        .await
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn start_follow(
    filter: JournalFilter,
    session_id: String,
    state: State<'_, FollowerState>,
    app_handle: AppHandle,
) -> Result<(), JournalError> {
    let follower = state.0.clone();
    tokio::task::spawn_blocking(move || {
        follower
            .lock()
            .map_err(|error| JournalError::ExecutionError(error.to_string()))?
            .start(&filter, session_id, app_handle)
    })
    .await
    .map_err(|error| JournalError::ExecutionError(error.to_string()))?
}

#[tauri::command]
pub async fn stop_follow(
    session_id: String,
    state: State<'_, FollowerState>,
) -> Result<(), JournalError> {
    let follower = state.0.clone();
    tokio::task::spawn_blocking(move || {
        follower
            .lock()
            .map_err(|error| JournalError::ExecutionError(error.to_string()))?
            .stop(&session_id);
        Ok(())
    })
    .await
    .map_err(|error| JournalError::ExecutionError(error.to_string()))?
}

#[tauri::command]
pub fn is_following(state: State<'_, FollowerState>) -> Result<bool, JournalError> {
    let follower = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    Ok(follower.is_running())
}

#[tauri::command]
pub async fn get_statistics(request: StatisticsRequest) -> Result<JournalStatistics, JournalError> {
    tokio::task::spawn_blocking(move || JournalReader::get_statistics(&request))
        .await
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}
