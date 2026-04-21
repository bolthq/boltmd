use encoding_rs::Encoding;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub content: String,
    pub encoding: String,
    pub last_modified: u64, // Unix timestamp (ms)
}

/// 读取文件，自动检测编码（优先 UTF-8，fallback GBK）
#[tauri::command]
pub fn read_file(path: String) -> Result<FileInfo, String> {
    let path_obj = Path::new(&path);

    let name = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.md")
        .to_string();

    let raw = std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    // 先尝试 UTF-8
    let (content, encoding) = if let Ok(s) = std::str::from_utf8(&raw) {
        (s.to_string(), "UTF-8".to_string())
    } else {
        // fallback: GBK
        let (decoded, enc, had_errors) = Encoding::for_label(b"GBK")
            .unwrap_or(encoding_rs::UTF_8)
            .decode(&raw);
        if had_errors {
            // 最后尝试 Latin-1（无损）
            let s = raw.iter().map(|&b| b as char).collect::<String>();
            (s, "Latin-1".to_string())
        } else {
            (decoded.into_owned(), enc.name().to_string())
        }
    };

    let last_modified = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(FileInfo {
        path,
        name,
        content,
        encoding,
        last_modified,
    })
}

/// 保存文件（UTF-8）
#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to save file: {e}"))
}

/// 获取文件元信息（不读取内容）
#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path_obj = Path::new(&path);

    if !path_obj.exists() {
        return Err(format!("File not found: {path}"));
    }

    let name = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.md")
        .to_string();

    let last_modified = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(FileInfo {
        path,
        name,
        content: String::new(), // 不读取内容
        encoding: "UTF-8".to_string(),
        last_modified,
    })
}

/// 保存图片（base64 → 二进制文件）
/// dir: 目标目录路径
/// filename: 文件名（如 boltmd-1234567890.png）
/// data: base64 编码的图片数据
#[tauri::command]
pub fn save_image(dir: String, filename: String, data: String) -> Result<String, String> {
    let dir_path = Path::new(&dir);

    // 确保目录存在
    if !dir_path.exists() {
        std::fs::create_dir_all(dir_path)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    // 解码 base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;

    // 写入文件
    let file_path = dir_path.join(&filename);
    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to save image: {e}"))?;

    // 返回完整路径
    Ok(file_path.to_string_lossy().to_string())
}
