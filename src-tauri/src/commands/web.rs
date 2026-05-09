use tauri::command;

/// Fetch the <title> of a web page. Returns the title string or an error.
/// Timeout is set to 5 seconds to avoid blocking the UI.
#[command]
pub async fn fetch_page_title(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    // Only read up to 64KB to find the title (avoid downloading huge pages).
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes[..bytes.len().min(65536)]);

    // Extract <title>...</title> using simple string search (avoids pulling in an HTML parser).
    let title = extract_title(&text).unwrap_or_default();
    if title.is_empty() {
        return Err("No title found".to_string());
    }
    Ok(title)
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_lowercase();
    let start = lower.find("<title")?;
    let after_tag = lower[start..].find('>')?;
    let content_start = start + after_tag + 1;
    let end = lower[content_start..].find("</title>")?;
    let title = &html[content_start..content_start + end];
    let title = title.trim();
    // Decode basic HTML entities.
    let title = title
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'");
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}
