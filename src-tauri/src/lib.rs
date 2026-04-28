mod commands;

use tauri::{Emitter, Manager};

/// Check whether the NSIS install sentinel exists (without consuming it —
/// that is done later by `read_config`).
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

/// Restore the window geometry from config.json and then show the window.
///
/// The window starts hidden (`visible: false` in tauri.conf.json) so that
/// position/size adjustments happen off-screen.  After geometry is set we
/// call `win.show()` — all within the synchronous `setup` hook, before the
/// WebView renders its first frame.
fn restore_window_geometry(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };

    // After a (re)install, ignore stale window state and just center.
    if has_install_sentinel(app) {
        let _ = win.center();
        let _ = win.show();
        return;
    }

    let positioned = (|| -> Option<()> {
        let data_dir = app.path().app_data_dir().ok()?;
        let raw = std::fs::read_to_string(data_dir.join("config.json")).ok()?;
        let config: serde_json::Value = serde_json::from_str(&raw).ok()?;
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
            restore_window_geometry(app.handle());
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
