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

/// Scan a single directory for plugin sub-directories containing manifest.json.
fn scan_dir(dir: &PathBuf, results: &mut Vec<ScannedPlugin>) {
    if !dir.exists() {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

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

        // Skip if a plugin with the same ID was already found (AppData takes priority).
        if results.iter().any(|p| p.name == name) {
            continue;
        }

        results.push(ScannedPlugin {
            name,
            path: path.to_string_lossy().to_string(),
            manifest: manifest_content,
        });
    }
}

/// Scan the plugins directory and return each sub-directory that contains a
/// manifest.json, along with the raw manifest content.
///
/// In debug builds, also scans the workspace `plugins/` directory so that
/// developers can test plugins without copying files to AppData.
#[tauri::command]
pub fn scan_plugins_dir(app: tauri::AppHandle) -> Result<Vec<ScannedPlugin>, String> {
    let mut results = Vec::new();

    // Primary: AppData plugins directory (user-installed plugins).
    let dir = plugins_dir(&app)?;
    scan_dir(&dir, &mut results);

    // Dev mode: also scan workspace plugins/ directory.
    #[cfg(debug_assertions)]
    {
        let workspace_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../plugins");
        if let Ok(canonical) = dunce::canonicalize(&workspace_plugins) {
            scan_dir(&canonical, &mut results);
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Plugin data directory helpers
// ---------------------------------------------------------------------------

/// Resolve the per-plugin data directory: <app_data_dir>/plugin-data/<plugin_id>
fn plugin_data_dir(app: &tauri::AppHandle, plugin_id: &str) -> Result<PathBuf, String> {
    validate_plugin_id(plugin_id)?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot locate app data dir: {e}"))?;
    Ok(data_dir.join("plugin-data").join(plugin_id))
}

/// Validate that a resolved path is still within the allowed sandbox root.
/// Uses `dunce::canonicalize` (on Windows this strips the `\\?\` prefix).
/// If the target file does not yet exist, we canonicalize the nearest existing
/// ancestor and verify the remaining suffix is safe.
fn validate_sandboxed_path(sandbox_root: &PathBuf, requested: &PathBuf) -> Result<PathBuf, String> {
    // Try to canonicalize the full path first (works if file exists).
    if let Ok(canonical) = dunce::canonicalize(requested) {
        let root = dunce::canonicalize(sandbox_root)
            .map_err(|e| format!("Cannot canonicalize sandbox root: {e}"))?;
        if !canonical.starts_with(&root) {
            return Err("Path escapes plugin sandbox".into());
        }
        return Ok(canonical);
    }

    // File doesn't exist yet — walk up to find the nearest existing ancestor.
    let mut ancestor = requested.clone();
    let mut suffix_parts: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if ancestor.exists() {
            break;
        }
        if let Some(file_name) = ancestor.file_name() {
            suffix_parts.push(file_name.to_os_string());
            if !ancestor.pop() {
                return Err("Cannot resolve path: no existing ancestor".into());
            }
        } else {
            return Err("Cannot resolve path: no existing ancestor".into());
        }
    }

    let canonical_ancestor = dunce::canonicalize(&ancestor)
        .map_err(|e| format!("Cannot canonicalize ancestor: {e}"))?;
    let root = dunce::canonicalize(sandbox_root)
        .map_err(|e| format!("Cannot canonicalize sandbox root: {e}"))?;

    // Rebuild the full path from canonical ancestor + remaining parts.
    let mut full = canonical_ancestor;
    for part in suffix_parts.iter().rev() {
        // Each remaining component must not be ".." or contain separators.
        let s = part.to_string_lossy();
        if s == ".." || s.contains('/') || s.contains('\\') {
            return Err("Path escapes plugin sandbox".into());
        }
        full.push(part);
    }

    if !full.starts_with(&root) {
        return Err("Path escapes plugin sandbox".into());
    }
    Ok(full)
}

// ---------------------------------------------------------------------------
// Plugin config commands
// ---------------------------------------------------------------------------

/// Read plugin config from <plugin_data_dir>/config.json.
/// Returns the JSON string, or "{}" if not found.
#[tauri::command]
pub fn read_plugin_config(app: tauri::AppHandle, plugin_id: String) -> Result<String, String> {
    let dir = plugin_data_dir(&app, &plugin_id)?;
    let config_path = dir.join("config.json");
    if !config_path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Cannot read plugin config: {e}"))
}

/// Write plugin config to <plugin_data_dir>/config.json.
/// Creates the directory if it does not exist.
#[tauri::command]
pub fn write_plugin_config(
    app: tauri::AppHandle,
    plugin_id: String,
    content: String,
) -> Result<(), String> {
    let dir = plugin_data_dir(&app, &plugin_id)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create plugin data dir: {e}"))?;
    let config_path = dir.join("config.json");
    std::fs::write(&config_path, content)
        .map_err(|e| format!("Cannot write plugin config: {e}"))
}

// ---------------------------------------------------------------------------
// Sandboxed filesystem commands
// ---------------------------------------------------------------------------

/// Read a file within the plugin's data sandbox.
#[tauri::command]
pub fn plugin_read_file(
    app: tauri::AppHandle,
    plugin_id: String,
    path: String,
) -> Result<String, String> {
    let sandbox = plugin_data_dir(&app, &plugin_id)?;
    let target = sandbox.join(&path);
    let safe_path = validate_sandboxed_path(&sandbox, &target)?;
    std::fs::read_to_string(&safe_path)
        .map_err(|e| format!("Cannot read file: {e}"))
}

/// Write a file within the plugin's data sandbox.
/// Creates parent directories as needed.
#[tauri::command]
pub fn plugin_write_file(
    app: tauri::AppHandle,
    plugin_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let sandbox = plugin_data_dir(&app, &plugin_id)?;
    std::fs::create_dir_all(&sandbox)
        .map_err(|e| format!("Cannot create plugin data dir: {e}"))?;
    let target = sandbox.join(&path);
    let safe_path = validate_sandboxed_path(&sandbox, &target)?;

    // Ensure parent directories exist.
    if let Some(parent) = safe_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create parent dirs: {e}"))?;
    }
    std::fs::write(&safe_path, content)
        .map_err(|e| format!("Cannot write file: {e}"))
}

/// Check if a file exists within the plugin's data sandbox.
#[tauri::command]
pub fn plugin_file_exists(
    app: tauri::AppHandle,
    plugin_id: String,
    path: String,
) -> Result<bool, String> {
    let sandbox = plugin_data_dir(&app, &plugin_id)?;
    let target = sandbox.join(&path);
    // For existence check, we validate only if the file actually exists.
    // If it doesn't exist, validate the ancestor to prevent traversal probing.
    let safe_path = validate_sandboxed_path(&sandbox, &target);
    match safe_path {
        Ok(p) => Ok(p.exists()),
        Err(_) => Err("Path escapes plugin sandbox".into()),
    }
}

/// Delete a file within the plugin's data sandbox.
#[tauri::command]
pub fn plugin_delete_file(
    app: tauri::AppHandle,
    plugin_id: String,
    path: String,
) -> Result<(), String> {
    let sandbox = plugin_data_dir(&app, &plugin_id)?;
    let target = sandbox.join(&path);
    let safe_path = validate_sandboxed_path(&sandbox, &target)?;
    if !safe_path.exists() {
        return Ok(()); // Deleting a non-existent file is a no-op.
    }
    if safe_path.is_dir() {
        std::fs::remove_dir_all(&safe_path)
            .map_err(|e| format!("Cannot delete directory: {e}"))
    } else {
        std::fs::remove_file(&safe_path)
            .map_err(|e| format!("Cannot delete file: {e}"))
    }
}

/// List directory contents within the plugin's data sandbox.
/// Returns a list of {name, is_dir} entries.
#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn plugin_list_dir(
    app: tauri::AppHandle,
    plugin_id: String,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let sandbox = plugin_data_dir(&app, &plugin_id)?;
    let target = if path.is_empty() || path == "." {
        sandbox.clone()
    } else {
        sandbox.join(&path)
    };
    let safe_path = validate_sandboxed_path(&sandbox, &target)?;
    if !safe_path.is_dir() {
        return Err("Path is not a directory".into());
    }

    let entries = std::fs::read_dir(&safe_path)
        .map_err(|e| format!("Cannot list directory: {e}"))?;

    let mut results = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        results.push(DirEntry { name, is_dir });
    }
    Ok(results)
}

/// Get the resolved data directory path for a plugin (for display/debugging).
#[tauri::command]
pub fn plugin_get_data_dir(
    app: tauri::AppHandle,
    plugin_id: String,
) -> Result<String, String> {
    let dir = plugin_data_dir(&app, &plugin_id)?;
    Ok(dir.to_string_lossy().to_string())
}
