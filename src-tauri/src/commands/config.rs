use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot locate app data dir: {e}"))?;
    Ok(data_dir.join("config.json"))
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

/// 读取配置文件；首次启动时写入默认配置并返回
#[tauri::command]
pub fn read_config(app: tauri::AppHandle) -> Result<Value, String> {
    let path = config_path(&app)?;

    if !path.exists() {
        // 首次启动：创建目录 + 写入默认配置
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

    serde_json::from_str::<Value>(&raw)
        .map_err(|e| format!("Failed to parse config JSON: {e}"))
}

/// 写入配置（全量替换）
#[tauri::command]
pub fn write_config(app: tauri::AppHandle, config: Value) -> Result<(), String> {
    let path = config_path(&app)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;

    std::fs::write(&path, json.as_bytes())
        .map_err(|e| format!("Failed to write config: {e}"))
}
