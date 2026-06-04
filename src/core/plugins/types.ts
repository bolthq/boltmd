// Plugin system type definitions.
//
// All PluginContext data/mutation methods are async (Promise-based) to allow
// future migration to Worker-based isolation without breaking plugin code.
// Exception: subscription methods return synchronous disposer functions
// (industry standard — matches VS Code Disposable, Obsidian registerEvent).

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

/** Permissions a plugin can request in its manifest. */
export type PluginPermission =
  | 'editor'          // Read/write editor content, cursor, selection
  | 'editor.readonly' // Read-only editor access
  | 'commands'        // Register command palette commands
  | 'statusbar'       // Register status bar items
  | 'sidebar'         // Register sidebar panels
  | 'config'          // Read/write plugin-private config
  | 'events'          // Subscribe to app events
  | 'fs:read'         // Read files (plugin data directory)
  | 'fs:write'        // Write files (plugin data directory)
  | 'network'         // HTTP requests (WebDAV, REST APIs, etc.)

/** Plugin manifest (manifest.json in plugin directory). */
export interface PluginManifest {
  /** Unique plugin identifier (e.g. "my-plugin"). Must match directory name. */
  id: string
  /** Human-readable display name. */
  name: string
  /** Semver version string. */
  version: string
  /** Plugin author name. */
  author: string
  /** Short description. */
  description: string
  /** Entry file path relative to plugin directory (default: "index.js"). */
  main: string
  /** Minimum BoltMD app version required (semver). */
  minAppVersion: string
  /** Plugin API version this plugin targets. */
  apiVersion: number
  /** Permissions this plugin requests. */
  permissions: PluginPermission[]
}

// ---------------------------------------------------------------------------
// Plugin Module (what index.js exports)
// ---------------------------------------------------------------------------

/** The module shape exported by a plugin's entry file. */
export interface PluginModule {
  /** Called when the plugin is activated. Receives the PluginContext. */
  activate(ctx: PluginContext): Promise<void> | void
  /** Called when the plugin is deactivated (disabled or app closing). */
  deactivate?(): Promise<void> | void
}

// ---------------------------------------------------------------------------
// Plugin Runtime State
// ---------------------------------------------------------------------------

export type PluginState = 'inactive' | 'active' | 'error'

/** Runtime representation of a loaded plugin. */
export interface PluginInstance {
  manifest: PluginManifest
  state: PluginState
  module: PluginModule | null
  context: PluginContext | null
  error: string | null
  /** Absolute path to the plugin directory. */
  dirPath: string
}

// ---------------------------------------------------------------------------
// PluginContext API
// ---------------------------------------------------------------------------

/** Main context object passed to plugin activate(). */
export interface PluginContext {
  /** Plugin's own manifest (read-only). */
  readonly manifest: PluginManifest

  /** Editor operations (requires 'editor' or 'editor.readonly' permission). */
  readonly editor: PluginEditorAPI

  /** Command palette registration (requires 'commands' permission). */
  readonly commands: PluginCommandsAPI

  /** Status bar item registration (requires 'statusbar' permission). */
  readonly statusbar: PluginStatusBarAPI

  /** Sidebar panel registration (requires 'sidebar' permission). */
  readonly sidebar: PluginSidebarAPI

  /** Plugin-private configuration storage (requires 'config' permission). */
  readonly config: PluginConfigAPI

  /** Event subscription (requires 'events' permission). */
  readonly events: PluginEventsAPI

  /** File system access (requires 'fs:read' or 'fs:write' permission). */
  readonly fs: PluginFileSystemAPI

  /** HTTP network requests (requires 'network' permission). */
  readonly network: PluginNetworkAPI
}

// ---------------------------------------------------------------------------
// Editor API
// ---------------------------------------------------------------------------

export interface PluginEditorAPI {
  /** Get the current document content as markdown. */
  getContent(): Promise<string>
  /** Get the current text selection. */
  getSelection(): Promise<string>
  /** Get word/character/line count. */
  getWordCount(): Promise<{ characters: number; words: number; lines: number }>
  /** Insert text at current cursor position. */
  insertText(text: string): Promise<void>
  /** Replace the entire document content. */
  setContent(markdown: string): Promise<void>
  /** Get current cursor position (line, column, offset). */
  getCursorPosition(): Promise<{ line: number; column: number; offset: number }>
  /** Set cursor position. */
  setCursorPosition(line: number, column: number): Promise<void>
  /** Subscribe to content changes. Returns synchronous unsubscribe function. */
  onContentChange(callback: (markdown: string) => void): () => void
  /** Get the current editor mode. */
  getMode(): Promise<'wysiwyg' | 'source' | 'split'>
}

// ---------------------------------------------------------------------------
// Commands API
// ---------------------------------------------------------------------------

export interface PluginCommandDefinition {
  /** Unique command ID (should be prefixed with plugin id, e.g. "my-plugin.doThing"). */
  id: string
  /** Display label shown in command palette. */
  label: string
  /** Optional keyboard shortcut (e.g. "Ctrl+Shift+H"). Actually bound, not display-only. */
  shortcut?: string
  /** Function to execute when the command is invoked. */
  action: () => void | Promise<void>
}

export interface PluginCommandsAPI {
  /** Register a command in the command palette (with optional shortcut binding). */
  register(command: PluginCommandDefinition): void
  /** Unregister a previously registered command. */
  unregister(commandId: string): void
}

// ---------------------------------------------------------------------------
// Status Bar API
// ---------------------------------------------------------------------------

export interface PluginStatusBarItem {
  /** Unique item ID. */
  id: string
  /** Text to display. */
  text: string
  /** Optional tooltip on hover. */
  tooltip?: string
  /** Optional click handler. */
  onClick?: () => void
  /** Position preference: 'left' or 'right'. Default: 'right'. */
  align?: 'left' | 'right'
  /** Sort priority (lower = further left within its alignment group). */
  priority?: number
}

export interface PluginStatusBarAPI {
  /** Add an item to the status bar. */
  addItem(item: PluginStatusBarItem): void
  /** Update an existing item's text/tooltip. */
  updateItem(id: string, updates: Partial<Pick<PluginStatusBarItem, 'text' | 'tooltip'>>): void
  /** Remove an item from the status bar. */
  removeItem(id: string): void
}

// ---------------------------------------------------------------------------
// Sidebar API
// ---------------------------------------------------------------------------

export interface PluginSidebarPanel {
  /** Unique panel ID. */
  id: string
  /** Panel title shown in the sidebar tab/header. */
  title: string
  /** Optional icon (emoji or short text). */
  icon?: string
  /** Mount function: receives a container element, render into it.
   *  Should return a cleanup/unmount function. */
  mount: (container: HTMLElement) => (() => void) | void
}

export interface PluginSidebarAPI {
  /** Register a sidebar panel. */
  registerPanel(panel: PluginSidebarPanel): void
  /** Unregister a sidebar panel. */
  unregisterPanel(panelId: string): void
  /** Show (expand) the sidebar, optionally focusing a specific panel. */
  show(panelId?: string): void
}

// ---------------------------------------------------------------------------
// Config API (plugin-private key/value storage)
// ---------------------------------------------------------------------------

export interface PluginConfigAPI {
  /** Get a config value by key. Returns undefined if not set. */
  get<T = unknown>(key: string): Promise<T | undefined>
  /** Set a config value. Persisted to disk. */
  set<T = unknown>(key: string, value: T): Promise<void>
  /** Delete a config key. */
  delete(key: string): Promise<void>
  /** Get all config key-value pairs for this plugin. */
  getAll(): Promise<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Events API
// ---------------------------------------------------------------------------

/** Events available to plugins (curated subset of internal events). */
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
  /** Subscribe to an app event. Returns synchronous unsubscribe function. */
  on(event: PluginEventName, handler: (...args: unknown[]) => void): () => void
  /** Emit a custom plugin event (namespaced with plugin ID automatically). */
  emit(event: string, ...args: unknown[]): void
}

// ---------------------------------------------------------------------------
// File System API
// ---------------------------------------------------------------------------

export interface PluginFileSystemAPI {
  /** Read a text file from the plugin's data directory. */
  readFile(path: string): Promise<string>
  /** Write a text file to the plugin's data directory. */
  writeFile(path: string, content: string): Promise<void>
  /** Check if a file exists in the plugin's data directory. */
  exists(path: string): Promise<boolean>
  /** Delete a file in the plugin's data directory. */
  deleteFile(path: string): Promise<void>
  /** List files in a directory within the plugin's data directory. */
  listDir(path: string): Promise<string[]>
  /** Get the plugin's private data directory absolute path. */
  getDataDir(): Promise<string>
}

// ---------------------------------------------------------------------------
// Network API
// ---------------------------------------------------------------------------

/** HTTP method supported by the plugin network API. */
export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
  | 'PROPFIND' | 'MKCOL' | 'COPY' | 'MOVE'

/** Options for an HTTP request. */
export interface HttpRequestOptions {
  /** Full URL (must be http:// or https://). */
  url: string
  /** HTTP method. */
  method: HttpMethod
  /** Request headers. */
  headers?: Record<string, string>
  /** Request body (string). */
  body?: string
  /** Timeout in milliseconds. Default: 30000, max: 120000. */
  timeout?: number
}

/** HTTP response returned by the network API. */
export interface HttpResponse {
  /** HTTP status code. */
  status: number
  /** Response headers (lowercase keys). */
  headers: Record<string, string>
  /** Response body as string. */
  body: string
}

export interface PluginNetworkAPI {
  /** Send an HTTP request. Requires 'network' permission. */
  request(options: HttpRequestOptions): Promise<HttpResponse>
}
