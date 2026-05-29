/**
 * Sidebar panel UI for Local History.
 * Renders a version timeline list and diff comparison view.
 */

import type { VersionEntry } from './storage'
import { VersionStorage } from './storage'
import { computeDiff, diffStats, type DiffLine } from './diff'

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
  border-bottom: 1px solid var(--border-primary, #333);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #999);
  flex-shrink: 0;
  box-shadow: none;
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
  padding: 6px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s;
  position: relative;
}

.lh-item:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

.lh-item:hover .lh-item-actions {
  opacity: 1;
}

.lh-item.active {
  background: var(--bg-active, rgba(255,255,255,0.08));
  border-left-color: var(--accent-primary, #64b5f6);
}

.lh-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lh-item-time {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e0e0e0);
}

.lh-item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.lh-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  color: var(--text-secondary, #999);
  font-size: 13px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
  outline: none;
}

.lh-icon-btn:focus,
.lh-icon-btn:focus-visible,
.lh-icon-btn:active {
  box-shadow: none;
  outline: none;
}

.lh-icon-btn:hover {
  color: var(--text-primary, #e0e0e0);
}

.lh-icon-btn.danger:hover {
  color: #e57373;
}

.lh-icon-btn.primary:hover {
  color: var(--accent-primary, #64b5f6);
}

.lh-item-meta {
  font-size: 11px;
  color: var(--text-secondary, #999);
  margin-top: 2px;
}

.lh-item-summary {
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lh-back-btn {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--accent-primary, #64b5f6);
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
}

.lh-back-btn:hover {
  background: var(--bg-hover, rgba(255,255,255,0.05));
}

.lh-diff-header {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-primary, #333);
  flex-shrink: 0;
}

.lh-diff-stats {
  font-size: 11px;
}

.lh-diff-stats .add { color: #81c784; }
.lh-diff-stats .del { color: #e57373; }

.lh-diff-actions {
  display: flex;
  gap: 4px;
}

.lh-diff-panel {
  flex: 1;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
}

.lh-diff-line {
  padding: 0 12px;
  white-space: pre-wrap;
  word-break: break-all;
}

.lh-diff-line.add {
  background: rgba(129, 199, 132, 0.12);
  color: #a5d6a7;
}

.lh-diff-line.del {
  background: rgba(229, 115, 115, 0.12);
  color: #ef9a9a;
}

.lh-diff-line .line-num {
  display: inline-block;
  width: 35px;
  color: var(--text-secondary, #666);
  user-select: none;
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
// SVG Icons (inline, small)
// ---------------------------------------------------------------------------

const ICON_RESTORE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6"/><path d="M6 4L3 7l3 3"/><path d="M13 13V8a4 4 0 0 0-4-4H3"/></svg>`
const ICON_DELETE = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M12 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4"/><line x1="7" y1="7" x2="7" y2="11"/><line x1="9" y1="7" x2="9" y2="11"/></svg>`

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
  private currentContent: string = ''
  private viewingTimestamp: number | null = null

  /** Callback when user clicks a version entry. */
  onVersionSelect: ((timestamp: number) => void) | null = null
  /** Callback when user clicks Restore. Receives the old content. */
  onRestore: ((content: string) => void) | null = null
  /** Callback when user clicks Delete. Receives the timestamp. */
  onDelete: ((timestamp: number) => void) | null = null

  constructor(storage: VersionStorage) {
    this.storage = storage
  }

  setFilePath(path: string | null): void {
    this.currentFilePath = path
    this.viewingTimestamp = null
    this.render()
  }

  setCurrentContent(content: string): void {
    this.currentContent = content
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

  /** Reset to list view (e.g. after delete). */
  backToList(): void {
    this.viewingTimestamp = null
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

    if (this.viewingTimestamp !== null) {
      await this.renderDiff(this.viewingTimestamp)
    } else {
      await this.renderList()
    }
  }

  private async renderList(): Promise<void> {
    if (!this.container || !this.currentFilePath) return

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

  private async renderDiff(timestamp: number): Promise<void> {
    if (!this.container || !this.currentFilePath) return

    let oldContent: string
    try {
      oldContent = await this.storage.loadVersion(this.currentFilePath, timestamp)
    } catch {
      // Version file missing — go back to list.
      this.viewingTimestamp = null
      await this.renderList()
      return
    }

    const diffLines = computeDiff(oldContent, this.currentContent)
    const stats = diffStats(diffLines)

    const panel = document.createElement('div')
    panel.className = 'lh-panel'

    // Back button
    const backBtn = document.createElement('div')
    backBtn.className = 'lh-back-btn'
    backBtn.textContent = '\u2190 Back to list'
    backBtn.addEventListener('click', () => {
      this.viewingTimestamp = null
      this.render()
    })
    panel.appendChild(backBtn)

    // Diff header with stats and icon actions
    const header = document.createElement('div')
    header.className = 'lh-diff-header'
    header.innerHTML = `
      <div class="lh-diff-stats">
        <span class="add">+${stats.additions}</span>
        <span class="del"> -${stats.deletions}</span>
      </div>
      <div class="lh-diff-actions">
        <button class="lh-icon-btn primary lh-restore-btn" title="Restore this version">${ICON_RESTORE}</button>
        <button class="lh-icon-btn danger lh-delete-btn" title="Delete this version">${ICON_DELETE}</button>
      </div>
    `

    // Wire action buttons
    header.querySelector('.lh-restore-btn')!.addEventListener('click', () => {
      if (this.onRestore) this.onRestore(oldContent)
    })
    header.querySelector('.lh-delete-btn')!.addEventListener('click', () => {
      if (this.onDelete) this.onDelete(timestamp)
    })

    panel.appendChild(header)

    // Diff content
    const diffPanel = document.createElement('div')
    diffPanel.className = 'lh-diff-panel'
    this.renderDiffLines(diffPanel, diffLines)
    panel.appendChild(diffPanel)

    this.container.innerHTML = ''
    this.container.appendChild(panel)
  }

  private renderDiffLines(container: HTMLElement, lines: DiffLine[]): void {
    const maxLines = 2000
    const toRender = lines.slice(0, maxLines)

    for (const line of toRender) {
      const el = document.createElement('div')
      el.className = `lh-diff-line ${line.type}`

      const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
      const num = line.type === 'del' ? line.oldNum : line.newNum
      el.innerHTML = `<span class="line-num">${num ?? ''}</span>${prefix} ${escapeHtml(line.text)}`
      container.appendChild(el)
    }

    if (lines.length > maxLines) {
      const more = document.createElement('div')
      more.className = 'lh-diff-line'
      more.textContent = `... ${lines.length - maxLines} more lines ...`
      container.appendChild(more)
    }
  }

  private createVersionItem(version: VersionEntry): HTMLElement {
    const item = document.createElement('div')
    item.className = 'lh-item'

    item.innerHTML = `
      <div class="lh-item-row">
        <div class="lh-item-time">${formatTime(version.timestamp)}</div>
        <div class="lh-item-actions">
          <button class="lh-icon-btn primary lh-item-restore" title="Restore">${ICON_RESTORE}</button>
          <button class="lh-icon-btn danger lh-item-delete" title="Delete">${ICON_DELETE}</button>
        </div>
      </div>
      <div class="lh-item-meta">${formatSize(version.size)}</div>
      <div class="lh-item-summary">${escapeHtml(version.summary)}</div>
    `

    // Click item → view diff
    item.addEventListener('click', (e) => {
      // Ignore if clicking action buttons
      if ((e.target as HTMLElement).closest('.lh-item-actions')) return

      this.viewingTimestamp = version.timestamp
      this.render()

      if (this.onVersionSelect) {
        this.onVersionSelect(version.timestamp)
      }
    })

    // Restore button on list item
    item.querySelector('.lh-item-restore')!.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!this.currentFilePath || !this.onRestore) return
      try {
        const content = await this.storage.loadVersion(this.currentFilePath, version.timestamp)
        this.onRestore(content)
      } catch (err) {
        console.error('[local-history] Failed to load version for restore:', err)
      }
    })

    // Delete button on list item
    item.querySelector('.lh-item-delete')!.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.onDelete) this.onDelete(version.timestamp)
    })

    return item
  }
}
