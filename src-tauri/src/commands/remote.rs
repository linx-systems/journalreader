use crate::error::JournalError;
use crate::journal::{
    BootInfo, ConnectionState, ConnectionStatus, JournalFilter, JournalQueryResult,
    JournalStatistics, RemoteHost, RemoteHostInput, RemoteJournalFollower, RemoteJournalReader,
    SharedConnectionManager, SharedHostStorage, StatisticsRequest, SystemUnit,
    TestConnectionResult,
};
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// Global state for host storage
pub struct HostStorageState(pub SharedHostStorage);

/// Global state for the SSH connection manager
pub struct ConnectionManagerState(pub SharedConnectionManager);

/// Global state for the remote journal follower
pub struct RemoteFollowerState(pub Mutex<RemoteJournalFollower>);

// ============================================================================
// Host Management Commands
// ============================================================================

#[tauri::command]
pub fn list_remote_hosts(
    state: State<'_, HostStorageState>,
) -> Result<Vec<RemoteHost>, JournalError> {
    let storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    Ok(storage.list().to_vec())
}

#[tauri::command]
pub fn get_remote_host(
    id: String,
    state: State<'_, HostStorageState>,
) -> Result<Option<RemoteHost>, JournalError> {
    let storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    Ok(storage.get(&id).cloned())
}

#[tauri::command]
pub fn add_remote_host(
    input: RemoteHostInput,
    state: State<'_, HostStorageState>,
) -> Result<RemoteHost, JournalError> {
    let mut storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    storage.add(input)
}

#[tauri::command]
pub fn update_remote_host(
    id: String,
    input: RemoteHostInput,
    state: State<'_, HostStorageState>,
) -> Result<RemoteHost, JournalError> {
    let mut storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    storage.update(&id, input)
}

#[tauri::command]
pub fn delete_remote_host(
    id: String,
    state: State<'_, HostStorageState>,
) -> Result<(), JournalError> {
    let mut storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    storage.delete(&id)
}

// ============================================================================
// Connection Management Commands
// ============================================================================

#[tauri::command]
pub async fn connect_to_host(
    host_id: String,
    password: Option<String>,
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<(), JournalError> {
    // Get the host configuration
    let host = {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        storage
            .get(&host_id)
            .cloned()
            .ok_or_else(|| JournalError::HostNotFound(host_id.clone()))?
    };

    // Connect in a blocking task
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let mut manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        manager.connect(&host, password.as_deref())
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))??;

    Ok(())
}

#[tauri::command]
pub fn disconnect_from_host(
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<(), JournalError> {
    let mut manager = conn_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    manager.disconnect();
    Ok(())
}

#[tauri::command]
pub fn get_connection_state(
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<ConnectionState, JournalError> {
    let manager = conn_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;

    Ok(ConnectionState {
        host_id: manager.current_host().map(|h| h.id.clone()),
        status: if manager.is_connected() {
            ConnectionStatus::Connected
        } else {
            ConnectionStatus::Disconnected
        },
        error_message: None,
    })
}

#[tauri::command]
pub async fn test_host_connection(
    host_id: String,
    password: Option<String>,
    host_state: State<'_, HostStorageState>,
) -> Result<TestConnectionResult, JournalError> {
    // Get the host configuration
    let host = {
        let storage = host_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        storage
            .get(&host_id)
            .cloned()
            .ok_or_else(|| JournalError::HostNotFound(host_id.clone()))?
    };

    // Test connection in a blocking task
    tokio::task::spawn_blocking(move || {
        use crate::journal::ssh::SshConnection;
        match SshConnection::connect(&host, password.as_deref()) {
            Ok(conn) => Ok(conn.test()),
            Err(e) => Ok(TestConnectionResult {
                success: false,
                message: e.to_string(),
                journalctl_available: false,
            }),
        }
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

// ============================================================================
// Remote Journal Query Commands
// ============================================================================

#[tauri::command]
pub async fn query_remote_journal(
    filter: JournalFilter,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<JournalQueryResult, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        RemoteJournalReader::query(&manager, &filter)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn get_remote_log_count(
    filter: JournalFilter,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<u64, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        RemoteJournalReader::count(&manager, &filter)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn list_remote_units(
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<Vec<SystemUnit>, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        RemoteJournalReader::list_units(&manager)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn list_remote_boots(
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<Vec<BootInfo>, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        RemoteJournalReader::list_boots(&manager)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

#[tauri::command]
pub async fn get_remote_statistics(
    request: StatisticsRequest,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<JournalStatistics, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        RemoteJournalReader::get_statistics(&manager, &request)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}

// ============================================================================
// Remote Follow Mode Commands
// ============================================================================

#[tauri::command]
pub fn start_remote_follow(
    filter: JournalFilter,
    password: Option<String>,
    conn_state: State<'_, ConnectionManagerState>,
    follower_state: State<'_, RemoteFollowerState>,
    app_handle: AppHandle,
) -> Result<(), JournalError> {
    // Get the currently connected host
    let host = {
        let manager = conn_state
            .0
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        manager
            .current_host()
            .cloned()
            .ok_or(JournalError::NotConnected)?
    };

    let mut follower = follower_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    follower.start(&host, password, &filter, app_handle)
}

#[tauri::command]
pub fn stop_remote_follow(
    state: State<'_, RemoteFollowerState>,
) -> Result<(), JournalError> {
    let mut follower = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    follower.stop();
    Ok(())
}

#[tauri::command]
pub fn is_remote_following(
    state: State<'_, RemoteFollowerState>,
) -> Result<bool, JournalError> {
    let follower = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    Ok(follower.is_running())
}
