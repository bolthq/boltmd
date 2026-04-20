mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::file::read_file,
            commands::file::save_file,
            commands::file::get_file_info,
            commands::config::read_config,
            commands::config::write_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
