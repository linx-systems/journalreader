use crate::error::JournalError;
use crate::journal::{BootInfo, JournalFilter, JournalQueryResult, JournalReader, SystemUnit};

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
