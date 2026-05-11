use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind, event::ModifyKind};
use tauri::{AppHandle, Emitter, Manager, State};

/// Managed state for the file watcher subsystem.
pub struct FileWatcherState(pub Mutex<WatcherInner>);

pub struct WatcherInner {
    /// The notify watcher instance (created lazily on first watch).
    pub watcher: Option<RecommendedWatcher>,
    /// Map from canonical file path → parent directory being watched.
    /// We watch the parent dir because many editors do atomic-save (write
    /// to tmp + rename), which doesn't trigger modify events on the file
    /// itself under some watchers.
    pub watched_files: HashMap<PathBuf, PathBuf>,
    /// Suppress notifications for paths that were just saved by the app.
    /// Value = Instant of the suppress call.  Expires after a short window.
    pub suppressed: HashMap<PathBuf, Instant>,
}

const SUPPRESS_WINDOW_MS: u128 = 2000;

/// Payload emitted to the frontend when a watched file changes externally.
#[derive(Clone, serde::Serialize)]
struct FileChangedPayload {
    path: String,
}

/// Create the watcher and wire up the event callback.
fn ensure_watcher(app: &AppHandle, inner: &mut WatcherInner) {
    if inner.watcher.is_some() {
        return;
    }

    let app_handle = app.clone();

    let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        let event = match res {
            Ok(e) => e,
            Err(_) => return,
        };

        // We only care about data modifications and renames (atomic save).
        // Ignore pure metadata changes (e.g. access time, indexing, antivirus scans)
        // which are common on Windows and don't indicate content changes.
        let dominated = matches!(
            event.kind,
            EventKind::Modify(ModifyKind::Data(_))
                | EventKind::Modify(ModifyKind::Any)
                | EventKind::Modify(ModifyKind::Name(_))
                | EventKind::Create(_)
                | EventKind::Remove(_)
        );
        if !dominated {
            return;
        }

        let state = app_handle.state::<FileWatcherState>();
        let guard = state.0.lock().unwrap();

        for path in &event.paths {
            // Canonicalize the path from the event.
            let canonical = match dunce::canonicalize(path) {
                Ok(p) => p,
                Err(_) => path.clone(),
            };

            // Is this a file we are watching?
            if !guard.watched_files.contains_key(&canonical) {
                continue;
            }

            // Check suppression.
            if let Some(suppressed_at) = guard.suppressed.get(&canonical) {
                if suppressed_at.elapsed().as_millis() < SUPPRESS_WINDOW_MS {
                    continue;
                }
            }

            // Emit event to frontend.
            let _ = app_handle.emit(
                "file-changed-externally",
                FileChangedPayload {
                    path: canonical.to_string_lossy().to_string(),
                },
            );
        }
    });

    match watcher {
        Ok(w) => inner.watcher = Some(w),
        Err(e) => eprintln!("[watcher] Failed to create watcher: {e}"),
    }
}

/// Start watching a file for external changes.
#[tauri::command]
pub fn watch_file(
    app: AppHandle,
    state: State<'_, FileWatcherState>,
    path: String,
) -> Result<(), String> {
    let canonical = dunce::canonicalize(&path)
        .map_err(|e| format!("Failed to canonicalize path: {e}"))?;

    let mut guard = state.0.lock().unwrap();

    // Already watching this file?
    if guard.watched_files.contains_key(&canonical) {
        return Ok(());
    }

    ensure_watcher(&app, &mut guard);

    let parent = canonical
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?
        .to_path_buf();

    // Check if we already watch this parent dir (for another file).
    let already_watching_parent = guard.watched_files.values().any(|d| *d == parent);

    // Register the file → parent mapping first.
    guard.watched_files.insert(canonical.clone(), parent.clone());

    // Only add a new OS watch if the parent dir isn't already watched.
    if !already_watching_parent {
        if let Some(ref mut w) = guard.watcher {
            w.watch(&parent, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Failed to watch directory: {e}"))?;
        }
    }

    Ok(())
}

/// Stop watching a file.
#[tauri::command]
pub fn unwatch_file(
    state: State<'_, FileWatcherState>,
    path: String,
) -> Result<(), String> {
    let canonical = dunce::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));

    let mut guard = state.0.lock().unwrap();

    let parent = match guard.watched_files.remove(&canonical) {
        Some(p) => p,
        None => return Ok(()), // Not watched, nothing to do.
    };

    // Remove suppression entry too.
    guard.suppressed.remove(&canonical);

    // If no other file shares this parent dir, unwatch at OS level.
    let still_needed = guard.watched_files.values().any(|d| *d == parent);
    if !still_needed {
        if let Some(ref mut w) = guard.watcher {
            let _ = w.unwatch(&parent);
        }
    }

    Ok(())
}

/// Temporarily suppress change notifications for a path (call before saving).
/// The suppression lasts for SUPPRESS_WINDOW_MS milliseconds.
#[tauri::command]
pub fn suppress_watcher(
    state: State<'_, FileWatcherState>,
    path: String,
) -> Result<(), String> {
    let canonical = dunce::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));

    let mut guard = state.0.lock().unwrap();
    guard.suppressed.insert(canonical, Instant::now());

    Ok(())
}
