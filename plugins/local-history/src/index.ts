/**
 * BoltMD Local History Plugin - Entry Point
 *
 * Listens to file:saved events and creates version snapshots automatically.
 * Registers a sidebar panel to display version timeline.
 */

import type { PluginContext } from './types'
import { VersionStorage } from './storage'
import { HistoryPanel } from './ui'

export async function activate(ctx: PluginContext): Promise<void> {
  const storage = new VersionStorage(ctx.fs, ctx.config)
  const panel = new HistoryPanel(storage)

  // Track current file path and its last known content.
  let currentFilePath: string | null = null
  let lastSavedContent: string | null = null

  // When a file is opened, track its path and initial content.
  ctx.events.on('file:opened', async (...args: unknown[]) => {
    const data = args[0] as { path: string } | undefined
    if (!data?.path) return

    currentFilePath = data.path
    panel.setFilePath(currentFilePath)

    try {
      const content = await ctx.editor.getContent()
      lastSavedContent = content
      panel.setCurrentContent(content)
    } catch {
      lastSavedContent = null
    }
  })

  // When a file is saved, create a version snapshot if content changed.
  ctx.events.on('file:saved', async (...args: unknown[]) => {
    const data = args[0] as { path: string } | undefined
    if (!data?.path) return

    currentFilePath = data.path
    panel.setFilePath(currentFilePath)

    try {
      const content = await ctx.editor.getContent()
      const saved = await storage.saveVersion(currentFilePath, content, lastSavedContent)

      if (saved) {
        lastSavedContent = content
        panel.setCurrentContent(content)
        panel.refresh()
      }
    } catch (err) {
      console.error('[local-history] Failed to save version:', err)
    }
  })

  // Register sidebar panel.
  ctx.sidebar.registerPanel({
    id: 'local-history.panel',
    title: 'History',
    icon: '\u{1F4CB}',
    mount: (container) => panel.mount(container),
  })

  // Wire restore action: replace editor content with selected version.
  panel.onRestore = async (content: string) => {
    await ctx.editor.setContent(content)
    lastSavedContent = content
    panel.setCurrentContent(content)
    panel.refresh()
  }

  // Wire delete action: remove version from storage and refresh list.
  panel.onDelete = async (timestamp: number) => {
    if (!currentFilePath) return
    await storage.deleteVersion(currentFilePath, timestamp)
    panel.refresh()
    updateStatusBar()
  }

  // Status bar: show version count for current file.
  ctx.statusbar.addItem({
    id: 'local-history.status',
    text: '',
    tooltip: 'Local History',
    align: 'right',
    priority: 200,
  })

  async function updateStatusBar(): Promise<void> {
    if (!currentFilePath) return
    try {
      const meta = await storage.loadMeta(currentFilePath)
      const count = meta.versions.length
      ctx.statusbar.updateItem('local-history.status', {
        text: count > 0 ? `${count} ver` : '',
        tooltip: count > 0
          ? `Local History: ${count} version${count > 1 ? 's' : ''}`
          : 'Local History: no versions yet',
      })
    } catch { /* ignore */ }
  }

  // Command: Ctrl+Shift+H to focus/open history panel.
  ctx.commands.register({
    id: 'local-history.show',
    label: 'Local History: Show Version History',
    shortcut: 'Ctrl+Shift+H',
    action: () => {
      // The panel is registered in sidebar; this shortcut serves as
      // a command palette entry and keyboard shortcut binding.
    },
  })

  console.log('[local-history] Plugin activated')
}

export function deactivate(): void {
  console.log('[local-history] Plugin deactivated')
}
