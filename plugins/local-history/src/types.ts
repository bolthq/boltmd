/**
 * Type declarations for BoltMD Plugin API.
 * Mirror of the host app's plugin types for compile-time checking.
 */

export interface PluginContext {
  readonly manifest: PluginManifest
  readonly editor: PluginEditorAPI
  readonly commands: PluginCommandsAPI
  readonly statusbar: PluginStatusBarAPI
  readonly sidebar: PluginSidebarAPI
  readonly config: PluginConfigAPI
  readonly events: PluginEventsAPI
  readonly fs: PluginFileSystemAPI
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  main: string
  minAppVersion: string
  apiVersion: number
  permissions: string[]
}

export interface PluginEditorAPI {
  getContent(): Promise<string>
  getSelection(): Promise<string>
  getWordCount(): Promise<{ characters: number; words: number; lines: number }>
  insertText(text: string): Promise<void>
  setContent(markdown: string): Promise<void>
  getCursorPosition(): Promise<{ line: number; column: number; offset: number }>
  setCursorPosition(line: number, column: number): Promise<void>
  onContentChange(callback: (markdown: string) => void): () => void
  getMode(): Promise<'wysiwyg' | 'source' | 'split'>
}

export interface PluginCommandDefinition {
  id: string
  label: string
  shortcut?: string
  action: () => void | Promise<void>
}

export interface PluginCommandsAPI {
  register(command: PluginCommandDefinition): void
  unregister(commandId: string): void
}

export interface PluginStatusBarItem {
  id: string
  text: string
  tooltip?: string
  onClick?: () => void
  align?: 'left' | 'right'
  priority?: number
}

export interface PluginStatusBarAPI {
  addItem(item: PluginStatusBarItem): void
  updateItem(id: string, updates: Partial<Pick<PluginStatusBarItem, 'text' | 'tooltip'>>): void
  removeItem(id: string): void
}

export interface PluginSidebarPanel {
  id: string
  title: string
  icon?: string
  mount: (container: HTMLElement) => (() => void) | void
}

export interface PluginSidebarAPI {
  registerPanel(panel: PluginSidebarPanel): void
  unregisterPanel(panelId: string): void
}

export interface PluginConfigAPI {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  getAll(): Promise<Record<string, unknown>>
}

export type PluginEventName =
  | 'file:opened'
  | 'file:saved'
  | 'file:external-change'
  | 'editor:content-change'
  | 'editor:mode-change'
  | 'tab:switch'
  | 'tab:close'
  | 'config:change'
  | 'theme:change'

export interface PluginEventsAPI {
  on(event: PluginEventName, handler: (...args: unknown[]) => void): () => void
  emit(event: string, ...args: unknown[]): void
}

export interface PluginFileSystemAPI {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  deleteFile(path: string): Promise<void>
  listDir(path: string): Promise<string[]>
  getDataDir(): Promise<string>
}
