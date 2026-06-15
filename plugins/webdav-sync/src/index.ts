/**
 * WebDAV Sync Plugin — bidirectional sync with status bar and conflict handling.
 *
 * Registers:
 *   - Sidebar settings panel for configuring server connection
 *   - Status bar item showing sync state
 *   - Commands: Sync Now, Pull Remote, Test Connection, List Remote, Resolve Conflict
 *   - file:saved listener: uploads saved file to remote server
 *   - Poll timer: detects remote changes and downloads them
 */

import type { PluginContext } from './types'
import { WebDAVClient, type WebDAVConfig } from './webdav-client'
import { SettingsPanel } from './settings-panel'

const CONFIG_KEY = 'connection'

const DEFAULT_CONFIG: WebDAVConfig = {
  serverUrl: '',
  remoteDir: '/boltmd/',
  username: '',
  password: '',
  authMethod: 'basic',
  timeout: 30000,
  autoSyncOnSave: true,
  draftSyncIntervalSec: 0,
  pollIntervalSec: 0,
}

// Sync states for status bar display.
type SyncState = 'idle' | 'uploading' | 'downloading' | 'conflict' | 'error' | 'offline'

let client: WebDAVClient | null = null
let draftTimer: ReturnType<typeof setInterval> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

export async function activate(ctx: PluginContext): Promise<void> {
  // Load connection config (if previously saved).
  const saved = await ctx.config.get<WebDAVConfig>(CONFIG_KEY)
  let config = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG }

  client = new WebDAVClient(ctx.network, config)

  // --- Status bar ---
  let currentState: SyncState = config.serverUrl ? 'idle' : 'offline'
  let conflictEtag: string | null = null
  let busyStartTime = 0
  let busyDelayTimer: ReturnType<typeof setTimeout> | null = null

  ctx.statusbar.addItem({
    id: 'sync-status',
    text: stateText('offline'),
    tooltip: 'WebDAV Sync: not configured',
    align: 'right',
    priority: 50,
    onClick: () => ctx.sidebar.show('settings'),
  })

  function setState(state: SyncState, detail?: string) {
    // Cancel any pending delayed transition.
    if (busyDelayTimer) {
      clearTimeout(busyDelayTimer)
      busyDelayTimer = null
    }

    // If entering a busy state, record start time.
    if (state === 'uploading' || state === 'downloading') {
      busyStartTime = Date.now()
      applyState(state, detail)
      return
    }

    // If leaving a busy state, ensure at least 1s of display.
    if (currentState === 'uploading' || currentState === 'downloading') {
      const elapsed = Date.now() - busyStartTime
      const MIN_DISPLAY = 1000
      if (elapsed < MIN_DISPLAY) {
        busyDelayTimer = setTimeout(() => {
          busyDelayTimer = null
          applyState(state, detail)
        }, MIN_DISPLAY - elapsed)
        return
      }
    }

    applyState(state, detail)
  }

  function applyState(state: SyncState, detail?: string) {
    currentState = state
    ctx.statusbar.updateItem('sync-status', {
      text: stateText(state),
      tooltip: detail || stateTooltip(state),
    })
  }

  function stateText(state: SyncState): string {
    switch (state) {
      case 'idle': return '\u21c5 Synced'
      case 'uploading': return '\u2191 Uploading'
      case 'downloading': return '\u2193 Downloading'
      case 'conflict': return '\u26a0 Conflict'
      case 'error': return '\u21c5 Error'
      case 'offline': return '\u21c5 Offline'
    }
  }

  function stateTooltip(state: SyncState): string {
    switch (state) {
      case 'idle': return 'WebDAV Sync: up to date'
      case 'uploading': return 'WebDAV Sync: uploading...'
      case 'downloading': return 'WebDAV Sync: downloading...'
      case 'conflict': return 'WebDAV Sync: conflict detected \u2014 use Pull Remote or Sync Now to resolve'
      case 'error': return 'WebDAV Sync: last operation failed'
      case 'offline': return 'WebDAV Sync: not configured'
    }
  }

  if (config.serverUrl) setState('idle')

  // --- Settings panel ---
  const panel = new SettingsPanel(
    config,
    // onSave
    async (newConfig) => {
      config = { ...newConfig }
      client!.updateConfig(config)
      await ctx.config.set(CONFIG_KEY, config)
      startDraftTimer()
      startPollTimer()
      setState(config.serverUrl ? 'idle' : 'offline')
      console.log('[webdav-sync] Config saved.')
    },
    // onTest
    async (testConfig) => {
      const tempClient = new WebDAVClient(ctx.network, testConfig)
      return tempClient.testConnection()
    }
  )

  ctx.sidebar.registerPanel({
    id: 'settings',
    title: 'WebDAV Sync',
    icon: '\u2601',  // cloud icon
    mount: (container) => panel.mount(container),
  })

  // --- Upload on save (always immediate) ---
  let lastSavedFileName: string | null = null
  let lastUploadedContent: string | null = null
  let lastKnownEtag: string | null = null

  ctx.events.on('file:saved', async (...args: unknown[]) => {
    const payload = args[0] as { path?: string } | undefined
    if (!payload?.path || !client || !config.serverUrl || !config.autoSyncOnSave) return

    const filePath = payload.path
    // Extract filename from full path (handles both / and \).
    const fileName = filePath.split(/[\\/]/).pop()
    if (!fileName) return

    lastSavedFileName = fileName

    try {
      const content = await ctx.editor.getContent()
      // Skip if content unchanged since last upload.
      if (content === lastUploadedContent) return

      setState('uploading')
      const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + fileName
      const result = await client.putFile(remotePath, content)
      lastUploadedContent = content
      lastKnownEtag = result.etag ? result.etag.replace(/"/g, '') : null
      conflictEtag = null
      setState('idle')
      console.log(`[webdav-sync] Uploaded "${fileName}" (etag: ${lastKnownEtag})`)
    } catch (err) {
      setState('error', `Upload failed: ${err}`)
      console.error(`[webdav-sync] Upload failed for "${fileName}":`, err)
    }
  })

  // --- Draft sync timer (uploads unsaved edits periodically) ---
  function startDraftTimer() {
    stopDraftTimer()
    if (config.draftSyncIntervalSec <= 0 || !config.serverUrl) return
    draftTimer = setInterval(async () => {
      if (!client || !lastSavedFileName) return
      if (currentState === 'conflict') return
      try {
        const content = await ctx.editor.getContent()
        if (content === lastUploadedContent) return

        setState('uploading')
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const result = await client.putFile(remotePath, content)
        lastUploadedContent = content
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, '') : null
        setState('idle')
        console.log(`[webdav-sync] Draft sync: uploaded "${lastSavedFileName}" (etag: ${lastKnownEtag})`)
      } catch (err) {
        setState('error', `Draft sync failed: ${err}`)
        console.error(`[webdav-sync] Draft sync failed:`, err)
      }
    }, config.draftSyncIntervalSec * 1000)
  }

  function stopDraftTimer() {
    if (draftTimer) {
      clearInterval(draftTimer)
      draftTimer = null
    }
  }

  startDraftTimer()

  // --- Poll remote for changes (downloads if remote is newer) ---
  function startPollTimer() {
    stopPollTimer()
    if (config.pollIntervalSec <= 0 || !config.serverUrl) return
    pollTimer = setInterval(async () => {
      if (!client || !lastSavedFileName) return
      if (currentState === 'conflict') return
      try {
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const info = await client.getFileInfo(remotePath)
        if (!info || !info.etag) return

        // No change since our last upload/download.
        if (info.etag === lastKnownEtag) return

        // Remote has changed. Check if we have local unsaved changes.
        const localContent = await ctx.editor.getContent()
        const hasLocalChanges = localContent !== lastUploadedContent

        if (hasLocalChanges) {
          // Conflict: both local and remote have changed.
          conflictEtag = info.etag
          setState('conflict', `Remote "${lastSavedFileName}" changed (etag: ${info.etag}) but local has unsaved edits.`)
          console.warn(`[webdav-sync] Conflict detected for "${lastSavedFileName}"`)
          return
        }

        // No local changes — safe to download and apply.
        setState('downloading')
        const { content, etag } = await client.getFile(remotePath)
        lastKnownEtag = etag
        lastUploadedContent = content
        await ctx.editor.setContent(content)
        setState('idle')
        console.log(`[webdav-sync] Downloaded remote change for "${lastSavedFileName}" (etag: ${etag})`)
      } catch (err) {
        setState('error', `Poll failed: ${err}`)
        console.error(`[webdav-sync] Poll failed:`, err)
      }
    }, config.pollIntervalSec * 1000)
  }

  function stopPollTimer() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  startPollTimer()

  // --- Commands ---

  ctx.commands.register({
    id: 'syncNow',
    label: 'WebDAV Sync: Sync Now (Push)',
    async action() {
      if (!client || !config.serverUrl) return
      if (!lastSavedFileName) {
        console.warn('[webdav-sync] No file has been saved yet.')
        return
      }
      try {
        setState('uploading')
        const content = await ctx.editor.getContent()
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const result = await client.putFile(remotePath, content)
        lastUploadedContent = content
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, '') : null
        conflictEtag = null
        setState('idle')
        console.log(`[webdav-sync] Manual sync: uploaded "${lastSavedFileName}" (etag: ${lastKnownEtag})`)
      } catch (err) {
        setState('error', `Manual sync failed: ${err}`)
        console.error(`[webdav-sync] Manual sync failed:`, err)
      }
    },
  })

  ctx.commands.register({
    id: 'pullRemote',
    label: 'WebDAV Sync: Pull Remote',
    async action() {
      if (!client || !config.serverUrl) return
      if (!lastSavedFileName) {
        console.warn('[webdav-sync] No file has been saved yet.')
        return
      }
      try {
        setState('downloading')
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const { content, etag } = await client.getFile(remotePath)
        lastKnownEtag = etag
        lastUploadedContent = content
        conflictEtag = null
        await ctx.editor.setContent(content)
        setState('idle')
        console.log(`[webdav-sync] Pulled remote "${lastSavedFileName}" (etag: ${etag})`)
      } catch (err) {
        setState('error', `Pull failed: ${err}`)
        console.error(`[webdav-sync] Pull failed:`, err)
      }
    },
  })

  ctx.commands.register({
    id: 'resolveKeepLocal',
    label: 'WebDAV Sync: Resolve Conflict \u2014 Keep Local',
    async action() {
      if (!client || !config.serverUrl || currentState !== 'conflict') return
      if (!lastSavedFileName) return
      try {
        setState('uploading')
        const content = await ctx.editor.getContent()
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const result = await client.putFile(remotePath, content)
        lastUploadedContent = content
        lastKnownEtag = result.etag ? result.etag.replace(/"/g, '') : null
        conflictEtag = null
        setState('idle')
        console.log(`[webdav-sync] Conflict resolved: kept local, pushed to remote (etag: ${lastKnownEtag})`)
      } catch (err) {
        setState('error', `Resolve failed: ${err}`)
        console.error(`[webdav-sync] Resolve (keep local) failed:`, err)
      }
    },
  })

  ctx.commands.register({
    id: 'resolveKeepRemote',
    label: 'WebDAV Sync: Resolve Conflict \u2014 Keep Remote',
    async action() {
      if (!client || !config.serverUrl || currentState !== 'conflict') return
      if (!lastSavedFileName) return
      try {
        setState('downloading')
        const remotePath = config.remoteDir.replace(/\/$/, '') + '/' + lastSavedFileName
        const { content, etag } = await client.getFile(remotePath)
        lastKnownEtag = etag
        lastUploadedContent = content
        conflictEtag = null
        await ctx.editor.setContent(content)
        setState('idle')
        console.log(`[webdav-sync] Conflict resolved: kept remote (etag: ${etag})`)
      } catch (err) {
        setState('error', `Resolve failed: ${err}`)
        console.error(`[webdav-sync] Resolve (keep remote) failed:`, err)
      }
    },
  })

  ctx.commands.register({
    id: 'testConnection',
    label: 'WebDAV Sync: Test Connection',
    async action() {
      if (!client) return
      const result = await client.testConnection()
      if (result.ok) {
        console.log('[webdav-sync] Connection successful!')
      } else {
        console.error('[webdav-sync] Connection failed:', result.error)
      }
    },
  })

  ctx.commands.register({
    id: 'listRemote',
    label: 'WebDAV Sync: List Remote Files',
    async action() {
      if (!client) return
      try {
        const files = await client.listDirectory(config.remoteDir)
        console.log(`[webdav-sync] ${files.length} files on remote:`)
        for (const f of files) {
          console.log(`  ${f.isCollection ? '[dir]' : '[file]'} ${f.href} (etag: ${f.etag})`)
        }
      } catch (err) {
        console.error('[webdav-sync] List failed:', err)
      }
    },
  })

  ctx.commands.register({
    id: 'openSettings',
    label: 'WebDAV Sync: Open Settings',
    action() {
      ctx.sidebar.show('settings')
    },
  })

  console.log('[webdav-sync] Plugin activated.')
}

export function deactivate(): void {
  if (draftTimer) {
    clearInterval(draftTimer)
    draftTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  client = null
  console.log('[webdav-sync] Plugin deactivated')
}
