/**
 * WebDAV Sync settings panel.
 * Provides UI for configuring server connection and testing it.
 * Includes a Sync Log tab for viewing operation history.
 */

import type { WebDAVConfig } from './webdav-client'

export type OnSave = (config: WebDAVConfig) => Promise<void>
export type OnTest = (config: WebDAVConfig) => Promise<{ ok: boolean; error?: string }>

// ---------------------------------------------------------------------------
// Sync log types
// ---------------------------------------------------------------------------

export interface SyncLogEntry {
  timestamp: number
  direction: 'upload' | 'download' | 'conflict' | 'error'
  file: string
  message: string
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.wds-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
}

.wds-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
}

.wds-tab {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.wds-tab:hover {
  color: var(--text-primary, #e0e0e0);
}

.wds-tab.active {
  color: var(--text-primary, #e0e0e0);
  border-bottom-color: var(--accent-primary, #64b5f6);
}

.wds-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wds-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wds-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #999);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.wds-field input,
.wds-field select {
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-primary, #333);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  outline: none;
  font-family: inherit;
}

.wds-field input:focus,
.wds-field select:focus {
  border-color: var(--accent-primary, #64b5f6);
}

.wds-field input::placeholder {
  color: var(--text-muted, #666);
}

.wds-checkbox-field label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
}

.wds-checkbox-field input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-primary, #64b5f6);
  cursor: pointer;
}

.wds-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.wds-btn {
  flex: 1;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-primary, #333);
  background: var(--bg-hover, #2a2a2a);
  color: var(--text-primary, #e0e0e0);
  transition: background 0.15s;
}

.wds-btn:hover {
  background: var(--bg-active, #333);
}

.wds-btn.primary {
  background: var(--accent-primary, #64b5f6);
  border-color: var(--accent-primary, #64b5f6);
  color: #fff;
}

.wds-btn.primary:hover {
  opacity: 0.9;
}

.wds-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wds-status {
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
}

.wds-status.success {
  background: rgba(129, 199, 132, 0.12);
  color: #a5d6a7;
}

.wds-status.error {
  background: rgba(229, 115, 115, 0.12);
  color: #ef9a9a;
}

.wds-status.info {
  background: rgba(100, 181, 246, 0.12);
  color: #90caf9;
}

.wds-log-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.wds-log-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary, #999);
  line-height: 1.6;
}

.wds-log-item {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary, #222);
}

.wds-log-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wds-log-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.wds-log-icon.upload { color: #81c784; }
.wds-log-icon.download { color: #64b5f6; }
.wds-log-icon.conflict { color: #ffb74d; }
.wds-log-icon.error { color: #e57373; }

.wds-log-file {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wds-log-time {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-left: auto;
  flex-shrink: 0;
}

.wds-log-msg {
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-top: 2px;
}

.wds-log-toolbar {
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.wds-log-filter {
  flex: 1;
  background: var(--bg-primary, #1e1e1e);
  border: 1px solid var(--border-primary, #333);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
  outline: none;
  font-family: inherit;
}

.wds-log-filter:focus {
  border-color: var(--accent-primary, #64b5f6);
}

.wds-log-filter::placeholder {
  color: var(--text-muted, #666);
}
`

let stylesInjected = false

function injectStyles(): void {
  if (stylesInjected) return
  const style = document.createElement('style')
  style.textContent = STYLES
  document.head.appendChild(style)
  stylesInjected = true
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLogTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (isToday) return time
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time
}

function logIcon(direction: SyncLogEntry['direction']): string {
  switch (direction) {
    case 'upload': return '\u2191'
    case 'download': return '\u2193'
    case 'conflict': return '\u26a0'
    case 'error': return '\u2716'
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

export class SettingsPanel {
  private container: HTMLElement | null = null
  private config: WebDAVConfig
  private onSave: OnSave
  private onTest: OnTest
  private statusEl: HTMLElement | null = null
  private activeTab: 'settings' | 'log' = 'settings'
  private logEntries: SyncLogEntry[]
  private onClearLog: (() => void) | null
  private logFilter = ''

  constructor(config: WebDAVConfig, onSave: OnSave, onTest: OnTest, logEntries: SyncLogEntry[], onClearLog?: () => void) {
    this.config = { ...config }
    this.onSave = onSave
    this.onTest = onTest
    this.logEntries = logEntries
    this.onClearLog = onClearLog ?? null
  }

  updateConfig(config: WebDAVConfig): void {
    this.config = { ...config }
    if (this.container && this.activeTab === 'settings') this.render()
  }

  /** Call when a new log entry is added to refresh the log view. */
  refreshLog(): void {
    if (this.container && this.activeTab === 'log') this.render()
  }

  mount(container: HTMLElement): () => void {
    injectStyles()
    this.container = container
    this.render()
    return () => { this.container = null }
  }

  private render(): void {
    if (!this.container) return

    const panel = document.createElement('div')
    panel.className = 'wds-panel'

    // Tab bar
    const tabs = document.createElement('div')
    tabs.className = 'wds-tabs'
    tabs.innerHTML = `
      <button class="wds-tab ${this.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
      <button class="wds-tab ${this.activeTab === 'log' ? 'active' : ''}" data-tab="log">Sync Log</button>
    `
    tabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null
      if (!btn) return
      this.activeTab = btn.dataset.tab as 'settings' | 'log'
      this.render()
    })
    panel.appendChild(tabs)

    if (this.activeTab === 'settings') {
      panel.appendChild(this.renderSettings())
    } else {
      panel.appendChild(this.renderLog())
    }

    this.container.innerHTML = ''
    this.container.appendChild(panel)
  }

  private renderSettings(): HTMLElement {
    const body = document.createElement('div')
    body.className = 'wds-body'

    body.innerHTML = `
      <div class="wds-field">
        <label>Server URL</label>
        <input type="text" data-field="serverUrl" placeholder="http://192.168.1.100:9090" />
      </div>
      <div class="wds-field">
        <label>Remote Directory</label>
        <input type="text" data-field="remoteDir" placeholder="/boltmd/" />
      </div>
      <div class="wds-field">
        <label>Auth Method</label>
        <select data-field="authMethod">
          <option value="basic">Basic Auth</option>
          <option value="bearer">Bearer Token</option>
        </select>
      </div>
      <div class="wds-field">
        <label>Username</label>
        <input type="text" data-field="username" placeholder="username" />
      </div>
      <div class="wds-field">
        <label>Password</label>
        <input type="password" data-field="password" placeholder="password" />
      </div>
      <div class="wds-field wds-checkbox-field">
        <label>
          <input type="checkbox" data-field="autoSyncOnSave" />
          Auto sync on save
        </label>
      </div>
      <div class="wds-field">
        <label>Draft sync interval (seconds, 0 = off)</label>
        <input type="number" data-field="draftSyncIntervalSec" min="0" max="3600" placeholder="0" />
      </div>
      <div class="wds-field">
        <label>Poll remote interval (seconds, 0 = off)</label>
        <input type="number" data-field="pollIntervalSec" min="0" max="3600" placeholder="0" />
      </div>
      <div class="wds-actions">
        <button class="wds-btn" data-action="test">Test</button>
        <button class="wds-btn primary" data-action="save">Save</button>
      </div>
      <div class="wds-status-container"></div>
    `

    // Fill current values.
    const inputs = body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')
    for (const input of inputs) {
      const field = input.dataset.field as keyof WebDAVConfig
      if (field && this.config[field] !== undefined) {
        if (input instanceof HTMLInputElement && input.type === 'checkbox') {
          input.checked = Boolean(this.config[field])
        } else {
          input.value = String(this.config[field])
        }
      }
    }

    // Bind input changes.
    for (const input of inputs) {
      const field = input.dataset.field as keyof WebDAVConfig
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        input.addEventListener('change', () => {
          (this.config as Record<string, unknown>)[field] = input.checked
        })
      } else {
        input.addEventListener('input', () => {
          if (field === 'timeout' || field === 'draftSyncIntervalSec' || field === 'pollIntervalSec') {
            (this.config as Record<string, unknown>)[field] = parseInt(input.value, 10) || 0
          } else {
            (this.config as Record<string, unknown>)[field] = input.value
          }
        })
        input.addEventListener('change', () => {
          if (field === 'timeout' || field === 'draftSyncIntervalSec' || field === 'pollIntervalSec') {
            (this.config as Record<string, unknown>)[field] = parseInt(input.value, 10) || 0
          } else {
            (this.config as Record<string, unknown>)[field] = input.value
          }
        })
      }
    }

    // Status container ref.
    this.statusEl = body.querySelector('.wds-status-container')

    // Bind buttons.
    body.querySelector('[data-action="test"]')!.addEventListener('click', () => this.handleTest())
    body.querySelector('[data-action="save"]')!.addEventListener('click', () => this.handleSave())

    return body
  }

  private renderLog(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;'

    if (this.logEntries.length === 0) {
      wrapper.innerHTML = `<div class="wds-log-empty">No sync operations yet.</div>`
      return wrapper
    }

    // Toolbar: filter input + clear button
    const toolbar = document.createElement('div')
    toolbar.className = 'wds-log-toolbar'
    toolbar.innerHTML = `
      <input type="text" class="wds-log-filter" placeholder="Filter by filename..." />
      <button class="wds-btn" style="flex:none;padding:3px 8px;">Clear</button>
    `
    const filterInput = toolbar.querySelector<HTMLInputElement>('.wds-log-filter')!
    filterInput.value = this.logFilter
    filterInput.addEventListener('input', () => {
      this.logFilter = filterInput.value
      this.renderLogList(list)
    })
    toolbar.querySelector('button')!.addEventListener('click', () => {
      this.logEntries.length = 0
      if (this.onClearLog) this.onClearLog()
      this.render()
    })
    wrapper.appendChild(toolbar)

    // Log list (newest first)
    const list = document.createElement('div')
    list.className = 'wds-log-list'
    this.renderLogList(list)

    wrapper.appendChild(list)
    return wrapper
  }

  private renderLogList(list: HTMLElement): void {
    list.innerHTML = ''
    const filter = this.logFilter.toLowerCase()

    let count = 0
    for (let i = this.logEntries.length - 1; i >= 0; i--) {
      const entry = this.logEntries[i]
      if (filter && !entry.file.toLowerCase().includes(filter)) continue
      count++
      const item = document.createElement('div')
      item.className = 'wds-log-item'
      item.innerHTML = `
        <div class="wds-log-item-row">
          <span class="wds-log-icon ${entry.direction}">${logIcon(entry.direction)}</span>
          <span class="wds-log-file">${escapeHtml(entry.file)}</span>
          <span class="wds-log-time">${formatLogTime(entry.timestamp)}</span>
        </div>
        <div class="wds-log-msg">${escapeHtml(entry.message)}</div>
      `
      list.appendChild(item)
    }

    if (count === 0) {
      list.innerHTML = `<div class="wds-log-empty">No matching entries.</div>`
    }
  }

  private async handleTest(): Promise<void> {
    this.showStatus('info', 'Testing connection...')
    this.setButtonsDisabled(true)

    try {
      const result = await this.onTest(this.config)
      if (result.ok) {
        this.showStatus('success', 'Connection successful!')
      } else {
        this.showStatus('error', `Connection failed: ${result.error}`)
      }
    } catch (err) {
      this.showStatus('error', `Error: ${err}`)
    } finally {
      this.setButtonsDisabled(false)
    }
  }

  private async handleSave(): Promise<void> {
    this.setButtonsDisabled(true)

    try {
      await this.onSave(this.config)
      this.showStatus('success', 'Settings saved.')
    } catch (err) {
      this.showStatus('error', `Save failed: ${err}`)
    } finally {
      this.setButtonsDisabled(false)
    }
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.container
      ?.querySelectorAll<HTMLButtonElement>('[data-action]')
      .forEach(b => b.disabled = disabled)
  }

  private statusTimer: ReturnType<typeof setTimeout> | null = null

  private showStatus(type: 'success' | 'error' | 'info', message: string): void {
    if (!this.statusEl) return
    this.statusEl.innerHTML = `<div class="wds-status ${type}">${message}</div>`
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.statusTimer = setTimeout(() => {
      if (this.statusEl) this.statusEl.innerHTML = ''
      this.statusTimer = null
    }, 4000)
  }
}
