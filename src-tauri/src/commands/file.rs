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

/// Read a file and auto-detect its encoding (UTF-8 → GBK → Latin-1).
#[tauri::command]
pub fn read_file(path: String) -> Result<FileInfo, String> {
    let path_obj = Path::new(&path);

    let name = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("untitled.md")
        .to_string();

    let raw = std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    // Fast path: UTF-8 BOM (EF BB BF).  Skip the 3-byte BOM and trust the
    // rest as UTF-8 — if it turns out invalid, from_utf8 below will catch it
    // and we fall through to the GBK / Latin-1 branches.
    let (content, encoding) = if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        match std::str::from_utf8(&raw[3..]) {
            Ok(s) => (s.to_string(), "UTF-8".to_string()),
            Err(_) => decode_fallback(&raw),
        }
    } else if let Ok(s) = std::str::from_utf8(&raw) {
        (s.to_string(), "UTF-8".to_string())
    } else {
        decode_fallback(&raw)
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

/// Fallback encoding detection: try GBK first, then Latin-1 (lossless).
fn decode_fallback(raw: &[u8]) -> (String, String) {
    let (decoded, enc, had_errors) = Encoding::for_label(b"GBK")
        .unwrap_or(encoding_rs::UTF_8)
        .decode(raw);
    if had_errors {
        // Latin-1 is a lossless 1:1 byte→char mapping — always succeeds.
        let s = raw.iter().map(|&b| b as char).collect::<String>();
        (s, "Latin-1".to_string())
    } else {
        (decoded.into_owned(), enc.name().to_string())
    }
}

/// Save file content as UTF-8.
#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to save file: {e}"))
}

/// Get file metadata without reading content.
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
        content: String::new(), // Content not read
        encoding: "UTF-8".to_string(),
        last_modified,
    })
}

/// Save a base64-encoded image to disk.
/// dir: target directory path
/// filename: file name (e.g. boltmd-1234567890.png)
/// data: base64-encoded image data
#[tauri::command]
pub fn save_image(dir: String, filename: String, data: String) -> Result<String, String> {
    let dir_path = Path::new(&dir);

    // Ensure target directory exists.
    if !dir_path.exists() {
        std::fs::create_dir_all(dir_path)
            .map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    // Decode base64 payload.
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode base64: {e}"))?;

    // Write the image file.
    let file_path = dir_path.join(&filename);
    std::fs::write(&file_path, &bytes)
        .map_err(|e| format!("Failed to save image: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}
