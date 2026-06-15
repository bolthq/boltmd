/**
 * WebDAV Sync settings panel.
 * Provides UI for configuring server connection and testing it.
 */

import type { WebDAVConfig } from './webdav-client'

export type OnSave = (config: WebDAVConfig) => Promise<void>
export type OnTest = (config: WebDAVConfig) => Promise<{ ok: boolean; error?: string }>

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

.wds-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary, #333);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
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
// Panel class
// ---------------------------------------------------------------------------

export class SettingsPanel {
  private container: HTMLElement | null = null
  private config: WebDAVConfig
  private onSave: OnSave
  private onTest: OnTest
  private statusEl: HTMLElement | null = null

  constructor(config: WebDAVConfig, onSave: OnSave, onTest: OnTest) {
    this.config = { ...config }
    this.onSave = onSave
    this.onTest = onTest
  }

  updateConfig(config: WebDAVConfig): void {
    this.config = { ...config }
    if (this.container) this.render()
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

    panel.innerHTML = `
      <div class="wds-header">WebDAV Sync</div>
      <div class="wds-body">
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
      </div>
    `

    // Fill current values.
    const inputs = panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]')
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
    this.statusEl = panel.querySelector('.wds-status-container')

    // Bind buttons.
    panel.querySelector('[data-action="test"]')!.addEventListener('click', () => this.handleTest())
    panel.querySelector('[data-action="save"]')!.addEventListener('click', () => this.handleSave())

    this.container.innerHTML = ''
    this.container.appendChild(panel)
  }

  private async handleTest(): Promise<void> {
    this.showStatus('info', 'Testing connection...')
    const btns = this.container?.querySelectorAll<HTMLButtonElement>('.wds-btn')
    btns?.forEach(b => b.disabled = true)

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
      btns?.forEach(b => b.disabled = false)
    }
  }

  private async handleSave(): Promise<void> {
    const btns = this.container?.querySelectorAll<HTMLButtonElement>('.wds-btn')
    btns?.forEach(b => b.disabled = true)

    try {
      await this.onSave(this.config)
      this.showStatus('success', 'Settings saved.')
    } catch (err) {
      this.showStatus('error', `Save failed: ${err}`)
    } finally {
      btns?.forEach(b => b.disabled = false)
    }
  }

  private statusTimer: ReturnType<typeof setTimeout> | null = null

  private showStatus(type: 'success' | 'error' | 'info', message: string): void {
    if (!this.statusEl) return
    this.statusEl.innerHTML = `<div class="wds-status ${type}">${message}</div>`
    if (this.statusTimer) clearTimeout(this.statusTimer)
    this.statusTimer = setTimeout(() => {
      if (this.statusEl) this.statusEl.innerHTML = ''
      this.statusTimer = null
    }, 3000)
  }
}
