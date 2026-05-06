import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { ask } from '@tauri-apps/plugin-dialog'
import { t } from '../../i18n'

interface FileChangedPayload {
  path: string
}

type ReloadHandler = (path: string) => Promise<void>

/**
 * FileWatcherService — Manages OS-level file watching via the Rust backend.
 *
 * Responsibilities:
 * 1. Invoke watch_file / unwatch_file / suppress_watcher Tauri commands
 * 2. Listen for "file-changed-externally" events from Rust
 * 3. Decide whether to auto-reload or prompt the user (based on dirty state)
 */
class FileWatcherServiceImpl {
  private unlisten: UnlistenFn | null = null
  private reloadHandler: ReloadHandler | null = null
  private dirtyChecker: ((path: string) => boolean) | null = null

  /**
   * Initialize the event listener.  Call once at app startup.
   * @param onReload - callback to reload a file's content into its tab
   * @param isDirty - callback to check if the file has unsaved local changes
   */
  async init(
    onReload: ReloadHandler,
    isDirty: (path: string) => boolean,
  ): Promise<void> {
    this.reloadHandler = onReload
    this.dirtyChecker = isDirty

    this.unlisten = await listen<FileChangedPayload>(
      'file-changed-externally',
      (event) => {
        this.handleChange(event.payload.path)
      },
    )
  }

  /** Clean up the event listener (call on app unmount). */
  dispose(): void {
    this.unlisten?.()
    this.unlisten = null
  }

  /** Start watching a file path for external changes. */
  async watch(path: string): Promise<void> {
    try {
      await invoke('watch_file', { path })
    } catch (e) {
      console.warn('[FileWatcher] Failed to watch:', path, e)
    }
  }

  /** Stop watching a file path. */
  async unwatch(path: string): Promise<void> {
    try {
      await invoke('unwatch_file', { path })
    } catch (e) {
      console.warn('[FileWatcher] Failed to unwatch:', path, e)
    }
  }

  /** Suppress notifications temporarily (call right before saving). */
  async suppress(path: string): Promise<void> {
    try {
      await invoke('suppress_watcher', { path })
    } catch (e) {
      console.warn('[FileWatcher] Failed to suppress:', path, e)
    }
  }

  /** Handle an external file change event. */
  private async handleChange(path: string): Promise<void> {
    if (!this.reloadHandler) return

    const dirty = this.dirtyChecker?.(path) ?? false

    if (!dirty) {
      // No local changes — silently reload.
      await this.reloadHandler(path)
    } else {
      // Has local changes — ask user what to do.
      const reload = await ask(
        t('fileWatcher.conflictMessage', { name: path.split(/[\\/]/).pop() ?? path }),
        {
          title: t('fileWatcher.conflictTitle'),
          kind: 'warning',
          okLabel: t('fileWatcher.reload'),
          cancelLabel: t('fileWatcher.keep'),
        },
      )
      if (reload) {
        await this.reloadHandler(path)
      }
    }
  }
}

export const fileWatcherService = new FileWatcherServiceImpl()
