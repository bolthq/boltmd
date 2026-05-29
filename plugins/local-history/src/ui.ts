/**
 * Sidebar panel UI for Local History.
 * Renders a version timeline list.
 */

import type { VersionEntry } from './storage'
import { VersionStorage } from './storage'

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.lh-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  overflow: hidden;
}

.lh-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #333);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
}

.lh-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary, #999);
  line-height: 1.6;
}

.lh-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.lh-item {
  padding: 8px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
}

.lh-item:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

.lh-item.active {
  background: var(--bg-active, rgba(255,255,255,0.08));
  border-left-color: var(--accent-color, #64b5f6);
}

.lh-item-time {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
}

.lh-item-meta {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-top: 2px;
}

.lh-item-summary {
  font-size: 11px;
  color: var(--text-tertiary, #666);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

function formatTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  if (isToday) return `Today ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time
}

function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} chars`
  return `${(chars / 1024).toFixed(1)} KB`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

export class HistoryPanel {
  private storage: VersionStorage
  private container: HTMLElement | null = null
  private currentFilePath: string | null = null

  /** Callback when user clicks a version entry. Set by index.ts in later steps. */
  onVersionSelect: ((timestamp: number) => void) | null = null

  constructor(storage: VersionStorage) {
    this.storage = storage
  }

  setFilePath(path: string | null): void {
    this.currentFilePath = path
    this.render()
  }

  mount(container: HTMLElement): () => void {
    injectStyles()
    this.container = container
    this.render()
    return () => { this.container = null }
  }

  refresh(): void {
    this.render()
  }

  private async render(): Promise<void> {
    if (!this.container) return

    if (!this.currentFilePath) {
      this.container.innerHTML = `
        <div class="lh-panel">
          <div class="lh-header">Local History</div>
          <div class="lh-empty">No file open</div>
        </div>
      `
      return
    }

    const meta = await this.storage.loadMeta(this.currentFilePath)
    const versions = meta.versions

    if (versions.length === 0) {
      this.container.innerHTML = `
        <div class="lh-panel">
          <div class="lh-header">Local History</div>
          <div class="lh-empty">No versions yet.<br>Versions are created automatically on save.</div>
        </div>
      `
      return
    }

    const panel = document.createElement('div')
    panel.className = 'lh-panel'
    panel.innerHTML = `<div class="lh-header">Local History (${versions.length})</div>`

    const list = document.createElement('div')
    list.className = 'lh-list'

    for (const version of versions) {
      list.appendChild(this.createVersionItem(version))
    }

    panel.appendChild(list)
    this.container.innerHTML = ''
    this.container.appendChild(panel)
  }

  private createVersionItem(version: VersionEntry): HTMLElement {
    const item = document.createElement('div')
    item.className = 'lh-item'

    item.innerHTML = `
      <div class="lh-item-time">${formatTime(version.timestamp)}</div>
      <div class="lh-item-meta">${formatSize(version.size)}</div>
      <div class="lh-item-summary">${escapeHtml(version.summary)}</div>
    `

    item.addEventListener('click', () => {
      if (this.onVersionSelect) {
        this.onVersionSelect(version.timestamp)
      }
    })

    return item
  }
}
