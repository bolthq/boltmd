use std::path::PathBuf;
use tauri::Manager;

/// Resolve the plugins directory: <app_data_dir>/plugins
fn plugins_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot locate app data dir: {e}"))?;
    Ok(data_dir.join("plugins"))
}

/// Basic validation to prevent path traversal in plugin IDs.
fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty() {
        return Err("Plugin ID cannot be empty".into());
    }
    if plugin_id.contains("..") || plugin_id.contains('/') || plugin_id.contains('\\') {
        return Err("Invalid plugin ID: must not contain path separators or '..'".into());
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// scan_plugins_dir
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct ScannedPlugin {
    pub name: String,
    pub path: String,
    pub manifest: String,
}

/// Scan the plugins directory and return each sub-directory that contains a
/// manifest.json, along with the raw manifest content.
#[tauri::command]
pub fn scan_plugins_dir(app: tauri::AppHandle) -> Result<Vec<ScannedPlugin>, String> {
    let dir = plugins_dir(&app)?;
    if !dir.exists() {
        // No plugins directory yet — not an error, just empty.
        return Ok(vec![]);
    }

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Cannot read plugins directory: {e}"))?;

    let mut results = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }
        let manifest_content = match std::fs::read_to_string(&manifest_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Validate the directory name as a plugin ID.
        if validate_plugin_id(&name).is_err() {
            continue;
        }

        results.push(ScannedPlugin {
            name,
            path: path.to_string_lossy().to_string(),
            manifest: manifest_content,
        });
    }

    Ok(results)
}
