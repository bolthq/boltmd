# Phase 17: WebDAV Sync Plugin — Design Document

## Overview

A built-in plugin that syncs the user's Markdown files with a WebDAV server.
Target use case: single user, multiple devices (laptop + desktop + NAS).
No real-time collaboration.

Compatible services: Nutstore (坚果云), NextCloud, Synology WebDAV, self-hosted
(Nginx/Apache/Caddy + Docker), any RFC 4918 compliant server.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│ Plugin (plugins/webdav-sync/)                                 │
│                                                               │
│  ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐ │
│  │ Settings │  │ Sync Engine│  │ Conflict  │  │ Status   │ │
│  │ Panel UI │  │  (core)    │  │ Resolver  │  │ Bar Item │ │
│  └──────────┘  └─────┬──────┘  └───────────┘  └──────────┘ │
│                       │                                       │
│              ┌────────▼────────┐                              │
│              │  WebDAV Client  │                              │
│              └────────┬────────┘                              │
└───────────────────────┼───────────────────────────────────────┘
                        │ ctx.network.request()
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ Plugin Network API (PluginContext.network)                     │
│ Permission: 'network'                                         │
└───────────────────────┬───────────────────────────────────────┘
                        │ invoke('plugin_http_request', ...)
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ Rust HTTP Command (plugin.rs)                                  │
│ Uses reqwest 0.12 (rustls-tls)                                │
│ - Validates plugin_id + 'network' permission flag             │
│ - Executes HTTP request (method, url, headers, body)          │
│ - Returns { status, headers, body }                           │
│ - Timeout: configurable, default 30s                          │
│ - Max response body: 10MB (safety limit)                      │
└───────────────────────────────────────────────────────────────┘
```

---

## Plugin Network API Design

### TypeScript Interface (added to types.ts)

```typescript
export interface PluginNetworkAPI {
  /** Send an HTTP request. Returns response object. */
  request(options: HttpRequestOptions): Promise<HttpResponse>
}

export interface HttpRequestOptions {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'PROPFIND' | 'MKCOL' | 'COPY' | 'MOVE'
  headers?: Record<string, string>
  body?: string
  /** Request timeout in milliseconds. Default: 30000. Max: 120000. */
  timeout?: number
}

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}
```

### Rust Command

```rust
#[tauri::command]
pub async fn plugin_http_request(
    plugin_id: String,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpResponsePayload, String>
```

### Security Constraints

- Only plugins with `"network"` in manifest.permissions can call this
- URL scheme must be `http://` or `https://` (no file://, ftp://, etc.)
- Response body truncated at 10MB
- Timeout capped at 120s
- Redirect following limited to 5 hops (same reqwest default)

---

## WebDAV Protocol Operations

| Operation | HTTP Method | Purpose |
|-----------|-------------|---------|
| List directory | PROPFIND (Depth:1) | Enumerate remote files |
| Download file | GET | Fetch file content |
| Upload file | PUT | Push file content |
| Delete file | DELETE | Remove remote file |
| Create directory | MKCOL | Create remote folder |
| Get metadata | PROPFIND (Depth:0) | Get ETag/mtime for single file |

### Authentication

- **Basic Auth**: `Authorization: Basic base64(user:pass)` — most common
- **Bearer Token**: `Authorization: Bearer <token>` — some enterprise servers
- Credentials stored encrypted in plugin config (or plaintext with warning)

---

## Sync Engine Design

### Sync State Model

```typescript
interface SyncState {
  /** Remote WebDAV server URL */
  serverUrl: string
  /** Remote directory path on server */
  remoteDir: string
  /** Local directory to sync (or single-file mode: track opened files) */
  mode: 'directory' | 'opened-files'
  /** File sync records */
  files: Map<string, FileSyncRecord>
}

interface FileSyncRecord {
  localPath: string
  remotePath: string
  /** Last known content hash (SHA-256 of content) */
  lastSyncHash: string
  /** Remote ETag from last sync */
  remoteEtag: string | null
  /** Last sync timestamp */
  lastSyncTime: number
  /** Current status */
  status: 'synced' | 'local-modified' | 'remote-modified' | 'conflict' | 'new'
}
```

### Sync Algorithm

```
On file:saved event:
  1. Compute hash of saved content
  2. Compare with lastSyncHash
  3. If different → mark as local-modified → schedule upload

On poll tick (interval-based):
  1. PROPFIND remote directory (Depth: 1)
  2. For each remote file:
     a. Compare ETag with stored remoteEtag
     b. If changed → mark as remote-modified → schedule download
  3. For files in local map but not on remote:
     → Deleted remotely (or new local file never synced)
     → Decide based on lastSyncTime

On upload:
  1. PUT file to remote
  2. Record new ETag from response
  3. Update lastSyncHash + lastSyncTime

On download:
  1. GET file from remote
  2. Compare local content hash with lastSyncHash
     - If local unchanged since last sync → safe to overwrite
     - If local also changed → CONFLICT

Conflict resolution:
  - Show conflict UI in sidebar
  - Options: keep local / keep remote / keep both (rename one)
  - Manual merge not in v1 scope
```

### Sync Triggers

| Trigger | Action |
|---------|--------|
| File saved | Upload changed file (debounced 2s) |
| Poll interval | Check remote for changes (default: 60s, configurable) |
| App startup | Full sync check (compare all tracked files) |
| Manual "Sync Now" | Force full sync immediately |
| Tab switch | Check if newly active file needs sync |

---

## Sync Modes

### Mode 1: Opened Files (Default)

Sync only files that the user has opened in BoltMD. Simplest mode,
no need to manage a directory tree.

- When user opens a file → add to sync tracking
- When file is saved → push to remote
- On poll → check remote versions of tracked files only

### Mode 2: Directory Sync (Future)

Sync an entire local directory with a remote WebDAV directory.
Deferred to post-Phase 21 (file tree feature). Not in v1 scope.

---

## Settings Panel UI

Sidebar panel (or modal dialog accessible from command palette):

```
┌─────────────────────────────────────────┐
│ WebDAV Sync Settings                    │
├─────────────────────────────────────────┤
│ Server URL:    [https://dav.example.com]│
│ Remote Dir:    [/boltmd/              ] │
│ Username:      [user                  ] │
│ Password:      [••••••••              ] │
│ Auth Method:   ○ Basic  ○ Bearer        │
│ Sync Interval: [60] seconds             │
│ Auto Sync:     [✓] On save              │
│                [✓] Periodic poll         │
│                                         │
│ [Test Connection]  [Save]               │
├─────────────────────────────────────────┤
│ Sync Status:                            │
│  Synced: 12 files                       │
│  Pending: 2 uploads                     │
│  Last sync: 2 minutes ago              │
├─────────────────────────────────────────┤
│ [Sync Now]  [View Conflicts (1)]        │
└─────────────────────────────────────────┘
```

---

## Status Bar Indicator

| State | Display | Tooltip |
|-------|---------|---------|
| Not configured | (hidden) | — |
| Idle/Synced | `☁ ✓` | "WebDAV: All synced" |
| Syncing | `☁ ↻` | "WebDAV: Syncing 2 files..." |
| Pending upload | `☁ ↑2` | "WebDAV: 2 files pending upload" |
| Error | `☁ ✗` | "WebDAV: Connection failed" |
| Conflict | `☁ !1` | "WebDAV: 1 conflict" |
| Offline | `☁ —` | "WebDAV: Offline (will retry)" |

Click action: open settings/sync panel in sidebar.

---

## Conflict Resolution UI

When conflict detected (both local and remote changed since last sync):

```
┌─────────────────────────────────────────┐
│ ⚠ Sync Conflict: notes/todo.md         │
├─────────────────────────────────────────┤
│ Local modified:  2024-01-15 14:30       │
│ Remote modified: 2024-01-15 14:28       │
│                                         │
│ [Keep Local]  [Keep Remote]  [Keep Both]│
│                                         │
│ "Keep Both" saves remote as             │
│ todo.conflict-20240115.md               │
└─────────────────────────────────────────┘
```

---

## Implementation Order (Minimum Functional Units)

### Unit 1: Plugin Network API (Rust + TypeScript)
- Add `plugin_http_request` async command in plugin.rs
- Add `PluginNetworkAPI` interface in types.ts
- Implement network API in PluginContext.ts (permission-gated)
- Add `network` to PluginLoader allowed permissions
- **Independently verifiable**: write a test plugin that fetches a URL

### Unit 2: WebDAV Client Layer (plugin/webdav-sync)
- Create plugin scaffold (manifest.json, package.json, tsconfig.json)
- Implement WebDAV operations: PROPFIND, GET, PUT, DELETE, MKCOL
- Parse WebDAV XML responses (PROPFIND returns multistatus XML)
- **Independently verifiable**: connect to test server, list/read/write files

### Unit 3: Sync Engine Core
- File hash computation (simple string hash, not crypto-grade)
- Sync state persistence (via plugin fs API)
- Change detection: local (on file:saved) + remote (PROPFIND compare)
- Upload/download logic
- **Independently verifiable**: save file → observe upload to server

### Unit 4: Settings Panel + Connection Test
- Sidebar panel with config form
- Persist credentials via config API
- "Test Connection" button (PROPFIND root)
- **Independently verifiable**: configure server, test passes

### Unit 5: Status Bar + Auto Sync
- Status bar indicator with state machine
- Save-triggered upload (debounced)
- Periodic poll timer
- Startup full-check
- **Independently verifiable**: status bar updates in real-time

### Unit 6: Conflict Detection + Resolution UI
- Detect conflict state (both sides changed)
- Conflict list in sidebar
- Resolution actions (keep local / keep remote / keep both)
- **Independently verifiable**: simulate conflict, resolve via UI

### Unit 7: Error Handling + Offline Support
- Network error retry with backoff
- Offline detection (consecutive failures)
- Queue pending operations for retry
- **Independently verifiable**: disconnect network, reconnect, pending syncs resume

### Unit 8: Multi-device History Sync (deferred — separate server repo)
- Sync local-history snapshots to remote `/.boltmd-history/` directory
- Merge remote history entries on pull
- Depends on P16 (local-history) storage format compatibility
- **Deferred**: requires custom BoltMD sync server (separate repo)

---

## File Structure

```
plugins/webdav-sync/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Plugin entry: activate/deactivate
│   ├── types.ts          # Mirrored type definitions
│   ├── webdav-client.ts  # WebDAV HTTP operations wrapper
│   ├── sync-engine.ts    # Core sync logic + state machine
│   ├── xml-parser.ts     # PROPFIND XML response parser
│   ├── hash.ts           # Content hashing utility
│   ├── ui-settings.ts    # Settings panel renderer
│   ├── ui-conflicts.ts   # Conflict resolution panel
│   └── constants.ts      # Config keys, default values
└── index.js              # Built output (esbuild bundle)
```

---

## Dependencies

### Rust side
- `reqwest` 0.12 (already in Cargo.toml) — HTTP client
- No new crates needed

### Plugin side
- Zero runtime dependencies (WebDAV XML parsing done manually for minimal bundle)
- `esbuild` for build (dev dependency)

---

## Security Considerations

1. **Credentials storage**: Stored in plugin config (JSON on disk). Future: integrate
   with OS keychain. For v1, warn user that credentials are stored in plaintext.
2. **Network scope**: Plugin can only reach URLs it explicitly requests. No wildcard.
3. **TLS**: reqwest with rustls — no cleartext HTTP in production (warn if http://).
4. **Path traversal**: Remote paths sanitized, no `..` allowed in remote dir config.
5. **Response size**: 10MB cap prevents memory exhaustion from malicious servers.

---

## Testing Strategy

1. **Unit tests**: Sync engine state transitions (mock network responses)
2. **Manual test**: Nutstore (坚果云) free account, NextCloud instance
3. **Edge cases**: Large files, unicode filenames, empty files, rapid saves

---

## Open Questions (to resolve during implementation)

1. Should we support partial/resumable uploads for large files?
   → Defer to v2. Most .md files are < 1MB.
2. Binary file sync (images referenced in .md)?
   → v1: text files only. v2: consider .mdz bundle sync.

## Resolved Decisions

1. **File path tracking**: Use paths relative to configured remote dir.
   Absolute local paths are stored only in the local sync state for mapping.
   This ensures multi-device portability (different machines can have different
   local directories pointing to the same remote root).
2. **Server implementation**: Separate repository (`boltmd-sync-server`).
   This plugin targets standard WebDAV protocol only.
3. **Sync mode v1**: "Opened files" mode only. Directory sync after Phase 21.
