mod commands;
mod error;
mod journal;

use commands::journal::{
    get_log_count, is_following, list_boots, list_units, query_journal, start_follow, stop_follow,
    FollowerState,
};
use journal::JournalFollower;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(FollowerState(Mutex::new(JournalFollower::new())))
        .invoke_handler(tauri::generate_handler![
            query_journal,
            list_units,
            list_boots,
            get_log_count,
            start_follow,
            stop_follow,
            is_following
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
