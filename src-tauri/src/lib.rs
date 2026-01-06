mod commands;
mod error;
mod journal;

use commands::journal::{get_log_count, list_boots, list_units, query_journal};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            query_journal,
            list_units,
            list_boots,
            get_log_count
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
