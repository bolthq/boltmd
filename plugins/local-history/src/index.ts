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
  const storage = new VersionStorage(ctx.fs)
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

  console.log('[local-history] Plugin activated')
}

export function deactivate(): void {
  console.log('[local-history] Plugin deactivated')
}
