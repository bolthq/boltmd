# Plugin System Design

## Overview

BoltMD plugin system allows third-party code to extend the editor through a
controlled API. Plugins are loaded from a local directory, validated, and given
a permission-scoped context object to interact with the app.

Key design constraints:

- **Async-first API**: All PluginContext methods return Promises, enabling future
  migration to Worker-based isolation without breaking existing plugins.
- **Permission-based access**: Plugins declare required permissions in their
  manifest; the context enforces these at call time.
- **Facade pattern**: PluginContext is a narrow adapter layer; internal
  refactors do not break the plugin contract.
- **Reactive registries**: Plugin-contributed UI elements (commands, status bar
  items, sidebar panels) are stored in Vue reactive refs so components update
  automatically.

---

## Architecture

```
┌─ Plugin (user code) ─────────────────────────────────┐
│  export function activate(ctx: PluginContext) { ... } │
│  export function deactivate() { ... }                 │
└──────────────────────┬────────────────────────────────┘
                       │ PluginContext (async API)
                       ▼
┌─ Frontend core ──────────────────────────────────────┐
│                                                      │
│  types.ts          — Type definitions (Manifest,     │
│                      Context, sub-APIs)              │
│                                                      │
│  PluginLoader.ts   — Scan directory via Rust,        │
│                      parse & validate manifests      │
│                                                      │
│  PluginManager.ts  — Lifecycle (activate/deactivate) │
│                      + reactive registries           │
│                                                      │
│  PluginContext.ts  — Factory: create per-plugin      │
│                      context with permission checks  │
│                                                      │
│  index.ts          — Barrel export                   │
└──────────────────────┬───────────────────────────────┘
                       │ invoke() IPC
                       ▼
┌─ Rust backend (plugin.rs) ───────────────────────────┐
│                                                      │
│  scan_plugins_dir      — Read plugins/ directory     │
│  read/write_plugin_config — Per-plugin config store  │
│  plugin_read_file      — Sandboxed FS read           │
│  plugin_write_file     — Sandboxed FS write          │
│  plugin_file_exists    — Sandboxed FS exists         │
│  plugin_delete_file    — Sandboxed FS delete         │
│  plugin_list_dir       — Sandboxed FS list           │
│  plugin_get_data_dir   — Return data dir path        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Dependency Graph

```
types.ts  ←── PluginLoader.ts
    ↑              ↑
    │              │ (uses types + invoke)
    │
    ├──── PluginManager.ts
    │         ↑
    │         │ (uses types; provides registries + register/unregister)
    │
    └──── PluginContext.ts
              ↑
              │ (uses types + PluginManager registers + EditorManager + invoke)
              │ (one-directional: Context → Manager, never the reverse)

Rust plugin.rs  ←── (independent, no frontend dependency)

App.vue  ←── orchestration layer
    │         (imports Loader + Manager + Context)
    │         (creates context, passes to Manager for activation)

UI components  ←── (imports Manager's reactive exports only)
```

**Key constraint**: PluginManager NEVER imports from PluginContext. The
activation orchestration (create context → pass to Manager) lives in App.vue.
This avoids circular dependencies and matches the pattern used by VS Code
(ExtensionHost) and Obsidian (App object injection).

---

## Implementation Steps

Task tracking is in [TASKS.md](../TASKS.md) (P15-1 through P15-10).
Below documents the dependency rationale for the chosen ordering.

### Ordering rationale

| Step | TASKS ID | Why this order |
|------|----------|----------------|
| 1 | P15-1 | Pure type declarations, zero runtime deps. All other modules import from here. |
| 2 | P15-2 | Rust command needed by the frontend PluginLoader (Step 3). Independent of frontend types. |
| 3 | P15-3 | Frontend caller for Rust scan. Depends on types (P15-1) + Rust (P15-2). |
| 4 | P15-4 | Reactive registries + plugin state store + shortcut registry. Depends only on types (P15-1). No lifecycle orchestration — just data and register functions. |
| 5 | P15-5 | PluginContext (Step 6) needs Rust config/FS commands. Extends plugin.rs from P15-2. |
| 6 | P15-6 | Context factory. One-directional dependency on Manager (imports register functions). Maintains internal disposer list for auto-cleanup. Also modifies EditorManager.ts to export getEditorMode(). |
| 7 | P15-7 | Orchestration glue: App.vue creates contexts + passes to Manager for activation. Dynamic import with file:// URL conversion. handleKeydown queries shortcut registry. Command execution wrapped in try-catch. |
| 8 | P15-8 | Append plugin commands to existing Command[] computed. Add built-in "Reload All Plugins" command. |
| 9 | P15-9 | Render plugin status bar items. Separate component, own sorting logic. |
| 10 | P15-10 | End-user management UI. Final piece, depends on reactive pluginInstances. |

### Build verification per step

- Frontend steps: `npx vue-tsc --noEmit`
- Rust steps: `cargo check --manifest-path src-tauri/Cargo.toml`
- Integration steps (P15-7+): both checks

---

## Security Model

### Path traversal prevention

- Plugin IDs are validated: reject empty, `..`, `/`, `\` characters.
- Sandboxed FS paths are validated in two layers:
  1. String check: reject `..` in requested path.
  2. Canonicalization: resolve symlinks via `dunce::canonicalize`, then verify
     the resolved path starts with the plugin's base directory.

### Permission enforcement

Plugin manifest declares permissions from a fixed set:

```
editor | editor.readonly | commands | statusbar | sidebar |
config | events | fs:read | fs:write | network
```

Note: `toolbar` permission is intentionally excluded from v1. The toolbar is
tightly coupled to WYSIWYG mode and has no stable extension point yet. It will
be added in a future apiVersion when the extension point is ready.

PluginContext checks permissions at every API call boundary. Undeclared
permissions result in an immediate thrown error.

### Isolation boundary

Currently plugins run in the same JS context (main thread). The async-first
API design means a future version can move plugin code into Web Workers with
a message-passing bridge — no plugin code changes required.

---

## Plugin Developer Workflow

1. Create directory: `<app_data>/plugins/my-plugin/`
2. Write `manifest.json`:
   ```json
   {
     "id": "my-plugin",
     "name": "My Plugin",
     "version": "1.0.0",
     "author": "Author",
     "description": "Does something useful",
     "main": "index.js",
     "minAppVersion": "0.5.0",
     "apiVersion": 1,
     "permissions": ["commands", "editor.readonly"]
   }
   ```
3. Write `index.js`:
   ```js
   export async function activate(ctx) {
     ctx.commands.register({
       id: 'my-plugin.hello',
       label: 'My Plugin: Say Hello',
       action: async () => {
         const content = await ctx.editor.getContent()
         console.log('Document length:', content.length)
       }
     })
   }

   export function deactivate() {
     // cleanup if needed
   }
   ```
4. Restart BoltMD (or toggle in Settings) to load.

---

## Design Decisions

### Async-first with subscription exception

All data-fetching and mutation methods return Promises (enabling future Worker
isolation). However, **subscription methods** (`onContentChange`, `events.on`)
return a synchronous disposer function `() => void`. This matches the industry
standard (VS Code `Disposable`, Obsidian `registerEvent`, Figma `on`).

Rationale: Subscriptions are local operations (adding to a listener array).
Even in a Worker model, subscriptions use message channels (event-driven), not
request-response Promises.

### Event exposure strategy

Only a curated subset of internal AppEvents is exposed to plugins:

```
file:opened | file:saved | file:external-change |
editor:content-change | editor:mode-change |
tab:switch | tab:close | config:change | theme:change
```

Excluded: `app:error` (internal diagnostic, not useful to plugins).
New events can be added in future apiVersions without breaking existing plugins.

### No circular imports

PluginManager holds state and registration functions. PluginContext imports
registration functions from Manager. Manager never imports from Context.
Activation orchestration (dynamic import → create context → register with
Manager) lives in App.vue. This matches VS Code's ExtensionHost pattern and
Obsidian's app-object injection.

### Plugin loading via dynamic import

Plugins are loaded with `import(fileUrl)` where `fileUrl` is constructed from
the absolute path using `new URL(path, 'file:///')`. Tauri's CSP is currently
`null` (no restrictions), so `file://` imports are not blocked. If CSP is
tightened in the future, a Tauri plugin-specific CSP directive or Rust-side
module loading would be needed.

### Keyboard shortcut binding

Plugin commands can declare a `shortcut` string (e.g. `"Ctrl+Shift+H"`).
Unlike the previous "display-only" design, shortcuts are actually bound:

- PluginManager maintains a `shortcutRegistry: Map<string, string>` mapping
  normalized shortcut strings to command IDs.
- App.vue's `handleKeydown()` queries this registry before falling through to
  hardcoded shortcuts. Plugin shortcuts take lower priority than built-in ones
  (no override of core shortcuts).
- Conflict detection: if two plugins register the same shortcut, last-registered
  wins. A console warning is emitted.

This matches Obsidian's `addCommand({ hotkeys })` pattern — simple, no
separate keybinding configuration UI needed for v1.

### Runtime error protection

All plugin-registered command `action()` calls are wrapped in try-catch at the
execution site (App.vue / CommandPalette). Errors are:

1. Caught and logged: `console.error('[Plugin:id] Command failed:', err)`
2. Optionally surfaced as a non-blocking toast/status bar message.
3. Plugin remains active (a single command failure doesn't deactivate it).

Activation errors (`activate()` throws) mark the plugin `state = 'error'` and
store the error message. The settings panel displays this status.

### Subscription auto-cleanup

PluginContext internally maintains a `disposers: (() => void)[]` list. Every
subscription made through the context (e.g. `events.on()`,
`editor.onContentChange()`) pushes its disposer to this list.

On deactivation, the orchestrator calls all disposers before invoking the
plugin's `deactivate()` function. This guarantees no leaked subscriptions even
if the plugin forgets to unsubscribe manually.

Pattern reference: VS Code's `context.subscriptions` auto-dispose,
Obsidian's `Component.registerEvent()` auto-cleanup.

### Reload plugins command

A built-in command "Reload All Plugins" is registered in the command palette
(P15-8). It executes: `deactivateAll() → scanPlugins() → activateAll()`.

This provides fast iteration for plugin developers without restarting the app.
Future enhancement: per-plugin reload and file-watching auto-reload.

---

## Future Enhancements (not in v1)

Documented for future apiVersion upgrades:

| Feature | Reference | Notes |
|---------|-----------|-------|
| Lazy activation (`activationEvents`) | VS Code | `manifest.json` declares when to activate; unneeded plugins never load |
| Declarative contributions | VS Code `contributes` | Commands/menus visible without loading plugin code |
| Plugin settings UI | Obsidian `SettingTab` | `plugin.renderSettings(container)` in settings panel |
| Context menu extension | VS Code `editor/context` | Right-click menu items from plugins |
| Inter-plugin API | VS Code `extension.exports` | One plugin exposes API, another consumes |
| Slow plugin watchdog | VS Code "Extension is slow" | Timeout detection for blocking operations |
| Toolbar permission + API | — | Deferred until toolbar has stable extension points |
| DOM sandboxing for sidebar panels | Figma iframe | Isolate plugin panels from main DOM |
