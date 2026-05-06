/// Return all file path arguments passed on the command line.
/// Usage: boltmd file1.md file2.md file3.md
#[tauri::command]
pub fn get_cli_file() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with("--"))
        .collect()
}
