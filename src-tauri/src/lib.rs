mod commands;
mod error;
mod journal;

use commands::journal::{
    get_log_count, get_statistics, is_following, list_boots, list_units, query_journal,
    start_follow, stop_follow, FollowerState,
};
use commands::remote::{
    add_remote_host, connect_to_host, delete_remote_host, disconnect_from_host,
    get_connection_state, get_remote_host, get_remote_log_count, get_remote_statistics,
    is_remote_following, list_remote_boots, list_remote_hosts, list_remote_units,
    query_remote_journal, start_remote_follow, stop_remote_follow, test_current_connection,
    test_host_connection, update_remote_host, ConnectionManagerState, HostStorageState,
    RemoteFollowerState,
};
use journal::{
    new_shared_connection_manager, new_shared_host_storage, JournalFollower,
    RemoteJournalFollower,
};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize host storage
    let host_storage = new_shared_host_storage().expect("Failed to initialize host storage");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        .manage(ConnectionManagerState(new_shared_connection_manager()))
        .manage(RemoteFollowerState(Mutex::new(RemoteJournalFollower::new())))
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
            disconnect_from_host,
            get_connection_state,
            test_current_connection,
            test_host_connection,
            // Remote journal commands
            query_remote_journal,
            get_remote_log_count,
            list_remote_units,
            list_remote_boots,
            get_remote_statistics,
            start_remote_follow,
            stop_remote_follow,
            is_remote_following
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
