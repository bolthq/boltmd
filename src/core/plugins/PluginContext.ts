// PluginContext: factory that creates a sandboxed context for each plugin.
// Each API method checks permissions before delegating to real implementation.
// Maintains an internal disposer list for automatic cleanup on deactivation.
//
// NOTE: This file does NOT export anything that PluginManager imports.
// PluginManager's types are imported here (one-way dependency).

import { invoke } from '@tauri-apps/api/core'
import type {
  PluginManifest,
  PluginPermission,
  PluginContext,
  PluginEditorAPI,
  PluginCommandsAPI,
  PluginStatusBarAPI,
  PluginSidebarAPI,
  PluginConfigAPI,
  PluginEventsAPI,
  PluginFileSystemAPI,
  PluginCommandDefinition,
  PluginStatusBarItem,
  PluginSidebarPanel,
  PluginEventName,
} from './types'
import {
  registerCommand,
  unregisterCommand,
  registerStatusBarItem,
  updateStatusBarItem,
  removeStatusBarItem,
  registerSidebarPanel,
  unregisterSidebarPanel,
  showSidebarPanel,
} from './PluginManager'
import {
  getContent,
  getActiveEditor,
  setContent,
  subscribeContentChange,
  unsubscribeContentChange,
} from '../editor/EditorManager'

// ---------------------------------------------------------------------------
// Event bus (simple pub/sub for app events exposed to plugins)
// ---------------------------------------------------------------------------

type EventHandler = (...args: unknown[]) => void
const eventListeners = new Map<string, Set<EventHandler>>()

/** Emit an app event to all plugin subscribers. Called by App.vue or other core modules. */
export function emitPluginEvent(event: string, ...args: unknown[]): void {
  const handlers = eventListeners.get(event)
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(...args)
      } catch (err) {
        console.error(`[PluginEvent] Error in handler for "${event}":`, err)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

/** Create a PluginContext for the given plugin manifest. */
export function createPluginContext(manifest: PluginManifest): PluginContext {
  const disposers: Array<() => void> = []

  // Permission check helper.
  function requirePermission(perm: PluginPermission): void {
    if (!manifest.permissions.includes(perm)) {
      throw new Error(
        `[Plugin:${manifest.id}] Missing permission "${perm}". ` +
        `Add it to manifest.json permissions array.`
      )
    }
  }

  // Helper: requires either 'editor' or 'editor.readonly'.
  function requireEditorRead(): void {
    if (
      !manifest.permissions.includes('editor') &&
      !manifest.permissions.includes('editor.readonly')
    ) {
      throw new Error(
        `[Plugin:${manifest.id}] Missing permission "editor" or "editor.readonly".`
      )
    }
  }

  // Helper: requires 'editor' (write access).
  function requireEditorWrite(): void {
    requirePermission('editor')
  }

  // --- Editor API ---
  const editor: PluginEditorAPI = {
    async getContent() {
      requireEditorRead()
      return getContent()
    },

    async getSelection() {
      requireEditorRead()
      const ed = getActiveEditor()
      return ed?.getSelection() ?? ''
    },

    async getWordCount() {
      requireEditorRead()
      const ed = getActiveEditor()
      if (ed) return ed.getWordCount()
      return { characters: 0, words: 0, lines: 0 }
    },

    async insertText(text: string) {
      requireEditorWrite()
      const ed = getActiveEditor()
      if (ed) ed.insertText(text)
    },

    async setContent(markdown: string) {
      requireEditorWrite()
      setContent(markdown)
    },

    async getCursorPosition() {
      requireEditorRead()
      const ed = getActiveEditor()
      if (ed) return ed.getCursorPosition()
      return { line: 0, column: 0, offset: 0 }
    },

    async setCursorPosition(line: number, column: number) {
      requireEditorWrite()
      const ed = getActiveEditor()
      if (ed) ed.setCursorPosition({ line, column, offset: 0 })
    },

    onContentChange(callback: (markdown: string) => void): () => void {
      requireEditorRead()
      subscribeContentChange(callback)
      const dispose = () => {
        unsubscribeContentChange(callback)
      }
      disposers.push(dispose)
      return dispose
    },

    async getMode() {
      requireEditorRead()
      // Import dynamically to avoid circular issues — mode is a simple ref.
      const { useEditorManager } = await import('../editor/EditorManager')
      const { mode } = useEditorManager()
      return mode.value
    },
  }

  // --- Commands API ---
  const commands: PluginCommandsAPI = {
    register(command: PluginCommandDefinition) {
      requirePermission('commands')
      // Auto-prefix command ID if not already prefixed.
      const prefixedCmd = {
        ...command,
        id: command.id.startsWith(`${manifest.id}.`)
          ? command.id
          : `${manifest.id}.${command.id}`,
      }
      registerCommand(manifest.id, prefixedCmd)
    },

    unregister(commandId: string) {
      requirePermission('commands')
      const fullId = commandId.startsWith(`${manifest.id}.`)
        ? commandId
        : `${manifest.id}.${commandId}`
      unregisterCommand(manifest.id, fullId)
    },
  }

  // --- Status Bar API ---
  const statusbar: PluginStatusBarAPI = {
    addItem(item: PluginStatusBarItem) {
      requirePermission('statusbar')
      const prefixedItem = {
        ...item,
        id: item.id.startsWith(`${manifest.id}.`)
          ? item.id
          : `${manifest.id}.${item.id}`,
      }
      registerStatusBarItem(manifest.id, prefixedItem)
    },

    updateItem(id: string, updates) {
      requirePermission('statusbar')
      const fullId = id.startsWith(`${manifest.id}.`)
        ? id
        : `${manifest.id}.${id}`
      updateStatusBarItem(manifest.id, fullId, updates)
    },

    removeItem(id: string) {
      requirePermission('statusbar')
      const fullId = id.startsWith(`${manifest.id}.`)
        ? id
        : `${manifest.id}.${id}`
      removeStatusBarItem(manifest.id, fullId)
    },
  }

  // --- Sidebar API ---
  const sidebar: PluginSidebarAPI = {
    registerPanel(panel: PluginSidebarPanel) {
      requirePermission('sidebar')
      const prefixedPanel = {
        ...panel,
        id: panel.id.startsWith(`${manifest.id}.`)
          ? panel.id
          : `${manifest.id}.${panel.id}`,
      }
      registerSidebarPanel(manifest.id, prefixedPanel)
    },

    unregisterPanel(panelId: string) {
      requirePermission('sidebar')
      const fullId = panelId.startsWith(`${manifest.id}.`)
        ? panelId
        : `${manifest.id}.${panelId}`
      unregisterSidebarPanel(manifest.id, fullId)
    },

    show(panelId?: string) {
      requirePermission('sidebar')
      const fullId = panelId
        ? (panelId.startsWith(`${manifest.id}.`) ? panelId : `${manifest.id}.${panelId}`)
        : undefined
      showSidebarPanel(fullId)
    },
  }

  // --- Config API ---
  const config: PluginConfigAPI = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      requirePermission('config')
      const raw = await invoke<string>('read_plugin_config', { pluginId: manifest.id })
      const obj = JSON.parse(raw)
      return obj[key] as T | undefined
    },

    async set<T = unknown>(key: string, value: T): Promise<void> {
      requirePermission('config')
      const raw = await invoke<string>('read_plugin_config', { pluginId: manifest.id })
      const obj = JSON.parse(raw)
      obj[key] = value
      await invoke('write_plugin_config', { pluginId: manifest.id, content: JSON.stringify(obj) })
    },

    async delete(key: string): Promise<void> {
      requirePermission('config')
      const raw = await invoke<string>('read_plugin_config', { pluginId: manifest.id })
      const obj = JSON.parse(raw)
      delete obj[key]
      await invoke('write_plugin_config', { pluginId: manifest.id, content: JSON.stringify(obj) })
    },

    async getAll(): Promise<Record<string, unknown>> {
      requirePermission('config')
      const raw = await invoke<string>('read_plugin_config', { pluginId: manifest.id })
      return JSON.parse(raw)
    },
  }

  // --- Events API ---
  const events: PluginEventsAPI = {
    on(event: PluginEventName, handler: (...args: unknown[]) => void): () => void {
      requirePermission('events')
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set())
      }
      eventListeners.get(event)!.add(handler)

      const dispose = () => {
        const set = eventListeners.get(event)
        if (set) {
          set.delete(handler)
          if (set.size === 0) eventListeners.delete(event)
        }
      }
      disposers.push(dispose)
      return dispose
    },

    emit(event: string, ...args: unknown[]) {
      requirePermission('events')
      // Namespace custom events with plugin ID.
      const namespacedEvent = `plugin:${manifest.id}:${event}`
      emitPluginEvent(namespacedEvent, ...args)
    },
  }

  // --- File System API ---
  const fs: PluginFileSystemAPI = {
    async readFile(path: string): Promise<string> {
      if (
        !manifest.permissions.includes('fs:read') &&
        !manifest.permissions.includes('fs:write')
      ) {
        throw new Error(`[Plugin:${manifest.id}] Missing permission "fs:read".`)
      }
      return invoke<string>('plugin_read_file', { pluginId: manifest.id, path })
    },

    async writeFile(path: string, content: string): Promise<void> {
      requirePermission('fs:write')
      await invoke('plugin_write_file', { pluginId: manifest.id, path, content })
    },

    async exists(path: string): Promise<boolean> {
      if (
        !manifest.permissions.includes('fs:read') &&
        !manifest.permissions.includes('fs:write')
      ) {
        throw new Error(`[Plugin:${manifest.id}] Missing permission "fs:read".`)
      }
      return invoke<boolean>('plugin_file_exists', { pluginId: manifest.id, path })
    },

    async deleteFile(path: string): Promise<void> {
      requirePermission('fs:write')
      await invoke('plugin_delete_file', { pluginId: manifest.id, path })
    },

    async listDir(path: string): Promise<string[]> {
      if (
        !manifest.permissions.includes('fs:read') &&
        !manifest.permissions.includes('fs:write')
      ) {
        throw new Error(`[Plugin:${manifest.id}] Missing permission "fs:read".`)
      }
      const entries = await invoke<Array<{ name: string; is_dir: boolean }>>(
        'plugin_list_dir',
        { pluginId: manifest.id, path }
      )
      return entries.map(e => e.name)
    },

    async getDataDir(): Promise<string> {
      if (
        !manifest.permissions.includes('fs:read') &&
        !manifest.permissions.includes('fs:write')
      ) {
        throw new Error(`[Plugin:${manifest.id}] Missing permission "fs:read" or "fs:write".`)
      }
      return invoke<string>('plugin_get_data_dir', { pluginId: manifest.id })
    },
  }

  // --- Build the context object ---
  const ctx: PluginContext = {
    manifest: Object.freeze({ ...manifest }),
    editor,
    commands,
    statusbar,
    sidebar,
    config,
    events,
    fs,
  }

  // Attach dispose method (not part of the public PluginContext interface,
  // used internally by activation orchestration).
  ;(ctx as PluginContextInternal).__dispose = () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch (err) {
        console.error(`[Plugin:${manifest.id}] Error during disposal:`, err)
      }
    }
    disposers.length = 0
  }

  return ctx
}

// ---------------------------------------------------------------------------
// Internal type extension (used by orchestration layer, not exported to plugins)
// ---------------------------------------------------------------------------

export interface PluginContextInternal extends PluginContext {
  __dispose(): void
}
