/// 返回启动时传入的第一个文件路径参数（如果有）
/// 用法：boltmd /path/to/file.md
#[tauri::command]
pub fn get_cli_file() -> Option<String> {
    // args()[0] 是程序自身，跳过
    std::env::args().nth(1).filter(|arg| {
        // 排除 tauri 内部标志（以 "--" 开头）
        !arg.starts_with("--")
    })
}
