use crate::error::JournalError;
use crate::journal::{
    keyring, BootInfo, ConnectionState, ConnectionStatus, HostKeyInfo, JournalFilter,
    JournalQueryResult, JournalStatistics, KnownHostsStorage, RemoteHost, RemoteHostInput,
    RemoteJournalFollower, RemoteJournalReader, SharedConnectionManager, SharedHostStorage,
    SharedKnownHostsStorage, SharedOfflineDatabase, StatisticsRequest, StoredHostKey, SystemUnit,
    TestConnectionResult,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

/// Global state for host storage
pub struct HostStorageState(pub SharedHostStorage);

/// Global state for the SSH connection manager
pub struct ConnectionManagerState(pub SharedConnectionManager);

/// Global state for host-specific remote followers.
pub struct RemoteFollowersState(pub Arc<Mutex<HashMap<String, RemoteJournalFollower>>>);

/// Global state for known SSH hosts
pub struct KnownHostsStorageState(pub SharedKnownHostsStorage);

/// Global state for the offline database
pub struct OfflineDatabaseState(pub SharedOfflineDatabase);

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

/// Test the currently active connection without reconnecting
#[tauri::command]
pub fn test_current_connection(
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<TestConnectionResult, JournalError> {
    let manager = conn_state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    manager.test_connection()
}

/// Test connection to a host by creating a temporary connection
/// Note: This bypasses host key verification for testing purposes
#[tauri::command]
pub async fn test_host_connection(
    host_id: String,
    password: Option<String>,
    host_state: State<'_, HostStorageState>,
    known_hosts_state: State<'_, KnownHostsStorageState>,
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

    let known_hosts = known_hosts_state.0.clone();

    // Test connection in a blocking task
    tokio::task::spawn_blocking(move || {
        use crate::journal::ssh::SshConnection;
        match SshConnection::connect(&host, password.as_deref(), &known_hosts) {
            Ok(conn) => Ok(conn.test()),
            Err(JournalError::HostKeyVerificationRequired(msg)) => Ok(TestConnectionResult {
                success: false,
                message: format!("Host key verification required: {}", msg),
                journalctl_available: false,
            }),
            Err(JournalError::HostKeyChanged(msg)) => Ok(TestConnectionResult {
                success: false,
                message: msg,
                journalctl_available: false,
            }),
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

/// Connect to a host using the exact host key the user approved.
#[tauri::command]
pub async fn connect_to_host_accept_key(
    host_id: String,
    expected_key: HostKeyInfo,
    password: Option<String>,
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<(), JournalError> {
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

    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let mut manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        manager.connect_and_accept_key(&host, password.as_deref(), &expected_key)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))??;

    Ok(())
}

// ============================================================================
// Host Key Management Commands
// ============================================================================

/// Get stored host key info for a specific host (if stored)
#[tauri::command]
pub fn get_host_key_info(
    hostname: String,
    port: u16,
    state: State<'_, KnownHostsStorageState>,
) -> Result<Option<StoredHostKey>, JournalError> {
    let storage = state
        .0
        .lock()
        .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
    Ok(storage.get_host_key(&hostname, port).cloned())
}

/// Fetch the current host key from a remote host (without storing it)
/// Use this to display the fingerprint to the user before they accept it
#[tauri::command]
pub async fn fetch_host_key(
    host_id: String,
    host_state: State<'_, HostStorageState>,
) -> Result<HostKeyInfo, JournalError> {
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

    // Connect temporarily to get the host key (without storing)
    tokio::task::spawn_blocking(move || {
        use ssh2::Session;
        use std::net::TcpStream;
        use std::time::Duration;

        let addr = format!("{}:{}", host.hostname, host.port);
        let tcp = TcpStream::connect_timeout(
            &addr.parse().map_err(|e| {
                JournalError::SshConnectionError(format!("Invalid address: {}", e))
            })?,
            Duration::from_secs(10),
        )
        .map_err(|e| JournalError::SshConnectionError(format!("Failed to connect: {}", e)))?;

        let mut session = Session::new()
            .map_err(|e| JournalError::SshConnectionError(format!("Failed to create session: {}", e)))?;

        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| JournalError::SshConnectionError(format!("SSH handshake failed: {}", e)))?;

        // Get host key info without storing
        KnownHostsStorage::get_session_host_key_info(&session, &host.hostname, host.port)
    })
    .await
    .map_err(|e| JournalError::ExecutionError(e.to_string()))?
}


// ============================================================================
// Remote Journal Query Commands
// ============================================================================

#[tauri::command]
pub async fn query_remote_journal(
    host_id: String,
    filter: JournalFilter,
    conn_state: State<'_, ConnectionManagerState>,
) -> Result<JournalQueryResult, JournalError> {
    let conn_manager = conn_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let manager = conn_manager
            .lock()
            .map_err(|e| JournalError::ExecutionError(e.to_string()))?;
        let requested_host_is_connected = manager.is_connected()
            && manager
                .current_host()
                .is_some_and(|host| host.id == host_id);
        if !requested_host_is_connected {
            return Err(JournalError::NotConnected);
        }
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

/// Start a session-specific follower only for the currently connected requested host.
#[tauri::command]
pub async fn start_remote_follow(
    host_id: String,
    filter: JournalFilter,
    session_id: String,
    password: Option<String>,
    host_state: State<'_, HostStorageState>,
    conn_state: State<'_, ConnectionManagerState>,
    followers_state: State<'_, RemoteFollowersState>,
    app_handle: AppHandle,
) -> Result<(), JournalError> {
    let hosts = host_state.0.clone();
    let connections = conn_state.0.clone();
    let followers = followers_state.0.clone();
    tokio::task::spawn_blocking(move || {
        let host = hosts
            .lock()
            .map_err(|error| JournalError::ExecutionError(error.to_string()))?
            .get(&host_id)
            .cloned()
            .ok_or_else(|| JournalError::HostNotFound(host_id.clone()))?;
        let known_hosts = {
            let manager = connections
                .lock()
                .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
            if manager.current_host().map(|current| current.id.as_str()) != Some(host_id.as_str()) {
                return Err(JournalError::NotConnected);
            }
            manager.known_hosts().clone()
        };
        followers
            .lock()
            .map_err(|error| JournalError::ExecutionError(error.to_string()))?
            .entry(host_id)
            .or_insert_with(RemoteJournalFollower::new)
            .start(&host, password, &filter, session_id, known_hosts, app_handle)
    })
    .await
    .map_err(|error| JournalError::ExecutionError(error.to_string()))?
}

/// Stop only the exact remote host/session pair.
#[tauri::command]
pub async fn stop_remote_follow(
    host_id: String,
    session_id: String,
    state: State<'_, RemoteFollowersState>,
) -> Result<(), JournalError> {
    let followers = state.0.clone();
    tokio::task::spawn_blocking(move || {
        let mut followers = followers
            .lock()
            .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
        if let Some(follower) = followers.get_mut(&host_id) {
            follower.stop(&session_id);
        }
        Ok(())
    })
    .await
    .map_err(|error| JournalError::ExecutionError(error.to_string()))?
}

#[tauri::command]
pub fn is_remote_following(
    host_id: String,
    state: State<'_, RemoteFollowersState>,
) -> Result<bool, JournalError> {
    let followers = state
        .0
        .lock()
        .map_err(|error| JournalError::ExecutionError(error.to_string()))?;
    Ok(followers.get(&host_id).is_some_and(RemoteJournalFollower::is_running))
}


// ============================================================================
// Keyring (Secure Password Storage) Commands
// ============================================================================

/// Check if the system keyring is available for secure password storage.
///
/// Returns true if passwords can be stored securely in the system keyring
/// (e.g., GNOME Keyring, KWallet, macOS Keychain, Windows Credential Manager).
/// Returns false on headless systems or when no keyring service is available.
#[tauri::command]
pub fn is_keyring_available() -> bool {
    keyring::is_keyring_available()
}

/// Save a password for a host in the system keyring.
///
/// The password is stored securely using the operating system's native
/// credential storage mechanism.
#[tauri::command]
pub fn save_host_password(host_id: String, password: String) -> Result<(), JournalError> {
    keyring::save_password(&host_id, &password)
}

/// Retrieve a saved password for a host from the system keyring.
///
/// Returns None if no password is stored for this host.
#[tauri::command]
pub fn get_host_password(host_id: String) -> Result<Option<String>, JournalError> {
    keyring::get_password(&host_id)
}

/// Delete a saved password for a host from the system keyring.
///
/// Returns true if a password was deleted, false if no password was stored.
#[tauri::command]
pub fn delete_host_password(host_id: String) -> Result<bool, JournalError> {
    keyring::delete_password(&host_id)
}
