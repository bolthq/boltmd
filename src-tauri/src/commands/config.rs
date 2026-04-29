use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Cached config loaded once during startup and returned on subsequent
/// `read_config` calls without hitting the filesystem again.
pub struct ConfigCache(pub Mutex<Option<Value>>);

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot locate app data dir: {e}"))?;
    Ok(data_dir.join("config.json"))
}

/// Check (and consume) the `.installed` sentinel that the NSIS installer
/// drops after every install / reinstall.  Returns `true` if the sentinel
/// was present, meaning this is the first launch after a (re)install.
///
/// The sentinel is checked in two locations for robustness:
///   1. The app data directory (%APPDATA%\<bundleId>)
///   2. Next to the executable (the install directory)
fn consume_install_sentinel(app: &tauri::AppHandle) -> bool {
    let mut found = false;

    // Location 1: app data dir
    if let Ok(data_dir) = app.path().app_data_dir() {
        let sentinel = data_dir.join(".installed");
        if sentinel.exists() {
            let _ = std::fs::remove_file(&sentinel);
            found = true;
        }
    }

    // Location 2: next to the exe (install dir)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sentinel = dir.join(".installed");
            if sentinel.exists() {
                let _ = std::fs::remove_file(&sentinel);
                found = true;
            }
        }
    }

    found
}

fn default_config() -> Value {
    serde_json::json!({
        "theme": "light",
        "fontSize": 15,
        "fontFamily": "system-ui, sans-serif",
        "lineHeight": 1.6,
        "tabSize": 2,
        "wordWrap": true,
        "autoSave": false,
        "autoSaveDelay": 3000,
        "defaultMode": "wysiwyg",
        "showLineNumbers": true,
        "showToolbar": false,
        "imageStorePath": "relative",
        "language": "en"
    })
}

/// Core config loading logic shared by `setup` hook and `read_config` command.
/// Reads config.json, handles first-launch defaults and sentinel-based reset.
pub fn load_config(app: &tauri::AppHandle) -> Result<Value, String> {
    let just_installed = consume_install_sentinel(app);
    let path = config_path(app)?;

    if !path.exists() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config dir: {e}"))?;
        }
        let default = default_config();
        let json = serde_json::to_string_pretty(&default)
            .map_err(|e| format!("Failed to serialize config: {e}"))?;
        std::fs::write(&path, json.as_bytes())
            .map_err(|e| format!("Failed to write default config: {e}"))?;
        return Ok(default);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {e}"))?;

    let mut config: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse config JSON: {e}"))?;

    if just_installed {
        if let Some(obj) = config.as_object_mut() {
            obj.insert("tabSession".into(), Value::Null);
            obj.insert("firstLaunch".into(), Value::Bool(true));
            obj.remove("windowState");

            if let Ok(json) = serde_json::to_string_pretty(&config) {
                let _ = std::fs::write(&path, json.as_bytes());
            }
        }
    }

    Ok(config)
}

/// Tauri command: return cached config if available, otherwise load from disk.
#[tauri::command]
pub fn read_config(app: tauri::AppHandle) -> Result<Value, String> {
    let cache = app.state::<ConfigCache>();
    let mut guard = cache.0.lock().unwrap();
    if let Some(ref cfg) = *guard {
        return Ok(cfg.clone());
    }
    // Fallback: load from disk (should rarely happen — setup hook populates cache).
    let cfg = load_config(&app)?;
    *guard = Some(cfg.clone());
    Ok(cfg)
}

/// 写入配置（全量替换）
#[tauri::command]
pub fn write_config(app: tauri::AppHandle, config: Value) -> Result<(), String> {
    // Update the in-memory cache so subsequent reads are consistent.
    {
        let cache = app.state::<ConfigCache>();
        let mut guard = cache.0.lock().unwrap();
        *guard = Some(config.clone());
    }

    let path = config_path(&app)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    std::fs::write(&path, json.as_bytes())
        .map_err(|e| format!("Failed to write config: {e}")
    )
}
