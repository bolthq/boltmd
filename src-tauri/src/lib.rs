mod commands;

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use commands::config::{ConfigCache, load_config};

/// Check whether the NSIS install sentinel exists (without consuming it —
/// that is done later by `load_config`).
fn has_install_sentinel(app: &tauri::AppHandle) -> bool {
    // Check app data dir
    if let Ok(data_dir) = app.path().app_data_dir() {
        if data_dir.join(".installed").exists() {
            return true;
        }
    }
    // Check next to the exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join(".installed").exists() {
                return true;
            }
        }
    }
    false
}

/// Restore the window geometry from the already-loaded config and show the
/// window.  The window starts hidden (`visible: false` in tauri.conf.json)
/// so that position/size adjustments happen off-screen.
fn restore_window_geometry(win: &tauri::WebviewWindow, config: &serde_json::Value) {
    let positioned = (|| -> Option<()> {
        let ws = config.get("windowState")?;
        if ws.is_null() { return None; }

        let w = ws.get("width").and_then(|v| v.as_f64())?;
        let h = ws.get("height").and_then(|v| v.as_f64())?;
        let x = ws.get("x").and_then(|v| v.as_f64())?;
        let y = ws.get("y").and_then(|v| v.as_f64())?;

        // The frontend saves physical pixels (innerSize / outerPosition),
        // so restore with PhysicalSize / PhysicalPosition to match.
        let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
        let _ = win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));

        if ws.get("maximized").and_then(|v| v.as_bool()).unwrap_or(false) {
            let _ = win.maximize();
        }
        Some(())
    })();

    if positioned.is_none() {
        let _ = win.center();
    }

    let _ = win.show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConfigCache(Mutex::new(None)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Focus the existing main window.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }

            // Forward the first non-flag argument (file path) to the frontend.
            if let Some(path) = args.get(1).filter(|a| !a.starts_with("--")) {
                let _ = app.emit("single-instance-open-file", path.clone());
            }
        }))
        .setup(|app| {
            let handle = app.handle();

            // Load config once — sentinel consumption + first-launch defaults
            // all happen here.  The result is cached in ConfigCache so the
            // frontend's `invoke('read_config')` returns instantly from memory.
            let config = load_config(handle).unwrap_or_default();
            {
                let cache = handle.state::<ConfigCache>();
                let mut guard = cache.0.lock().unwrap();
                *guard = Some(config.clone());
            }

            // Restore window geometry from the loaded config.
            if let Some(win) = app.get_webview_window("main") {
                if has_install_sentinel(handle) {
                    let _ = win.center();
                    let _ = win.show();
                } else {
                    restore_window_geometry(&win, &config);
                }
            }

            Ok(())
        })
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
