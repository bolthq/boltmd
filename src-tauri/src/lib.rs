mod commands;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Focus the existing main window.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }

            // Forward the first non-flag argument (file path) to the frontend.
            if let Some(path) = args.get(1).filter(|a| !a.starts_with("--")) {
                let _ = app.emit("single-instance-open-file", path.clone());
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::file::read_file,
            commands::file::save_file,
            commands::file::get_file_info,
            commands::file::save_image,
            commands::config::read_config,
            commands::config::write_config,
            commands::cli::get_cli_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
