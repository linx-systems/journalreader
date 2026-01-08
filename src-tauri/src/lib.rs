mod commands;
mod error;
mod journal;

use commands::journal::{
    get_log_count, get_statistics, is_following, list_boots, list_units, query_journal,
    start_follow, stop_follow, FollowerState,
};
use commands::remote::{
    accept_host_key, add_remote_host, connect_to_host, connect_to_host_accept_key,
    delete_host_password, delete_remote_host, disconnect_from_host, fetch_host_key,
    get_connection_state, get_host_key_info, get_host_password, get_remote_host,
    get_remote_log_count, get_remote_statistics, is_keyring_available, is_remote_following,
    list_remote_boots, list_remote_hosts, list_remote_units, query_remote_journal, remove_host_key,
    save_host_password, start_remote_follow, stop_remote_follow, test_current_connection,
    test_host_connection, update_remote_host, ConnectionManagerState, HostStorageState,
    KnownHostsStorageState, OfflineDatabaseState, RemoteFollowerState,
};
use journal::{
    check_file_permissions, get_app_config_dir, new_shared_connection_manager,
    new_shared_host_storage, new_shared_known_hosts_storage, new_shared_offline_database,
    JournalFollower, RemoteJournalFollower,
};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check file permissions on startup
    check_config_file_permissions();

    // Initialize host storage
    let host_storage = new_shared_host_storage().expect("Failed to initialize host storage");
    // Initialize known hosts storage for SSH host key verification
    let known_hosts =
        new_shared_known_hosts_storage().expect("Failed to initialize known hosts storage");
    // Initialize offline database for cached journal logs
    let offline_db =
        new_shared_offline_database().expect("Failed to initialize offline database");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Install signal handler for graceful shutdown with exit code 0
            // This prevents exit code 143 (SIGTERM) when stopping dev server
            let handle = app.handle().clone();
            ctrlc::set_handler(move || {
                handle.exit(0);
            })
            .expect("Error setting signal handler");
            Ok(())
        })
        // Local journal state
        .manage(FollowerState(Mutex::new(JournalFollower::new())))
        // Remote host state
        .manage(HostStorageState(host_storage))
        .manage(KnownHostsStorageState(known_hosts.clone()))
        .manage(ConnectionManagerState(new_shared_connection_manager(
            known_hosts,
        )))
        .manage(RemoteFollowerState(Mutex::new(RemoteJournalFollower::new())))
        // Offline database state
        .manage(OfflineDatabaseState(offline_db))
        .invoke_handler(tauri::generate_handler![
            // Local journal commands
            query_journal,
            list_units,
            list_boots,
            get_log_count,
            get_statistics,
            start_follow,
            stop_follow,
            is_following,
            // Remote host management commands
            list_remote_hosts,
            get_remote_host,
            add_remote_host,
            update_remote_host,
            delete_remote_host,
            // Remote connection commands
            connect_to_host,
            connect_to_host_accept_key,
            disconnect_from_host,
            get_connection_state,
            test_current_connection,
            test_host_connection,
            // Host key management commands
            get_host_key_info,
            fetch_host_key,
            accept_host_key,
            remove_host_key,
            // Remote journal commands
            query_remote_journal,
            get_remote_log_count,
            list_remote_units,
            list_remote_boots,
            get_remote_statistics,
            start_remote_follow,
            stop_remote_follow,
            is_remote_following,
            // Keyring commands (secure password storage)
            is_keyring_available,
            save_host_password,
            get_host_password,
            delete_host_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Check config file permissions on startup and warn if insecure
fn check_config_file_permissions() {
    if let Ok(config_dir) = get_app_config_dir() {
        let hosts_file = config_dir.join("hosts.json");
        let known_hosts_file = config_dir.join("known_hosts.json");

        // Check and warn about insecure permissions
        if let Some(warning) = check_file_permissions(&hosts_file) {
            eprintln!("[Security] {}", warning);
        }
        if let Some(warning) = check_file_permissions(&known_hosts_file) {
            eprintln!("[Security] {}", warning);
        }
    }
}
