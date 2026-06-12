/**
 * Type definitions mirrored from host app.
 * Only includes APIs used by this plugin (Unit 1: network + commands + config).
 */

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

export interface PluginContext {
  readonly manifest: PluginManifest
  readonly editor: PluginEditorAPI
  readonly commands: PluginCommandsAPI
  readonly statusbar: PluginStatusBarAPI
  readonly sidebar: PluginSidebarAPI
  readonly config: PluginConfigAPI
  readonly events: PluginEventsAPI
  readonly fs: PluginFileSystemAPI
  readonly network: PluginNetworkAPI
}

export interface PluginEditorAPI {
  getContent(): Promise<string>
  setContent(markdown: string): Promise<void>
  getSelection(): Promise<string>
  insertText(text: string): Promise<void>
  getCursorPosition(): Promise<{ line: number; column: number; offset: number }>
  setCursorPosition(line: number, column: number): Promise<void>
  getWordCount(): Promise<{ characters: number; words: number; lines: number }>
  getMode(): Promise<'wysiwyg' | 'source' | 'split'>
  onContentChange(callback: (markdown: string) => void): () => void
}

export interface PluginCommandsAPI {
  register(command: {
    id: string
    label: string
    shortcut?: string
    action: () => void | Promise<void>
  }): void
  unregister(commandId: string): void
}

export interface PluginStatusBarAPI {
  addItem(item: {
    id: string
    text: string
    tooltip?: string
    onClick?: () => void
    align?: 'left' | 'right'
    priority?: number
  }): void
  updateItem(id: string, updates: Partial<{ text: string; tooltip: string }>): void
  removeItem(id: string): void
}

export interface PluginSidebarAPI {
  registerPanel(panel: {
    id: string
    title: string
    icon?: string
    mount: (container: HTMLElement) => (() => void) | void
  }): void
  unregisterPanel(panelId: string): void
  show(panelId?: string): void
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

export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  | 'PROPFIND' | 'MKCOL' | 'COPY' | 'MOVE'

export interface HttpRequestOptions {
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface PluginNetworkAPI {
  request(options: HttpRequestOptions): Promise<HttpResponse>
}
