/**
 * BoltMD Local History Plugin - Entry Point
 *
 * Listens to file:saved events and creates version snapshots automatically.
 */

import type { PluginContext } from './types'
import { VersionStorage } from './storage'

export async function activate(ctx: PluginContext): Promise<void> {
  const storage = new VersionStorage(ctx.fs)

  // Track current file path and its last known content.
  let currentFilePath: string | null = null
  let lastSavedContent: string | null = null

  // When a file is opened, track its path and initial content.
  ctx.events.on('file:opened', async (...args: unknown[]) => {
    const data = args[0] as { path: string } | undefined
    if (!data?.path) return

    currentFilePath = data.path

    try {
      lastSavedContent = await ctx.editor.getContent()
    } catch {
      lastSavedContent = null
    }
  })

  // When a file is saved, create a version snapshot if content changed.
  ctx.events.on('file:saved', async (...args: unknown[]) => {
    const data = args[0] as { path: string } | undefined
    if (!data?.path) return

    currentFilePath = data.path

    try {
      const content = await ctx.editor.getContent()
      const saved = await storage.saveVersion(currentFilePath, content, lastSavedContent)

      if (saved) {
        console.log('[local-history] Version saved for', currentFilePath)
        lastSavedContent = content
      }
    } catch (err) {
      console.error('[local-history] Failed to save version:', err)
    }
  })

  console.log('[local-history] Plugin activated')
}

export function deactivate(): void {
  console.log('[local-history] Plugin deactivated')
}
