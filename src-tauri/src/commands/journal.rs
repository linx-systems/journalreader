use crate::error::JournalError;
use crate::journal::{
    BootInfo, JournalFilter, JournalFollower, JournalQueryResult, JournalReader, JournalStatistics,
    StatisticsRequest, SystemUnit,
};
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// Global state for the journal follower
pub struct FollowerState(pub Mutex<JournalFollower>);

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
pub fn start_follow(
    filter: JournalFilter,
    state: State<'_, FollowerState>,
    app_handle: AppHandle,
) -> Result<(), JournalError> {
    let mut follower = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    follower.start(&filter, app_handle)
}

#[tauri::command]
pub fn stop_follow(state: State<'_, FollowerState>) -> Result<(), JournalError> {
    let mut follower = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    follower.stop();
    Ok(())
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
