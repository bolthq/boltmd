/**
 * WebDAV Sync Plugin — connection test + settings panel.
 *
 * Registers:
 *   - Sidebar settings panel for configuring server connection
 *   - Commands: Test Connection, List Remote Files
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
}

let client: WebDAVClient | null = null

export async function activate(ctx: PluginContext): Promise<void> {
  // Load connection config (if previously saved).
  const saved = await ctx.config.get<WebDAVConfig>(CONFIG_KEY)
  let config = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG }

  client = new WebDAVClient(ctx.network, config)

  // --- Settings panel ---
  const panel = new SettingsPanel(
    config,
    // onSave
    async (newConfig) => {
      config = { ...newConfig }
      client!.updateConfig(config)
      await ctx.config.set(CONFIG_KEY, config)
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

  // --- Commands ---

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
  client = null
  console.log('[webdav-sync] Plugin deactivated')
}
