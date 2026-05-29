/**
 * BoltMD Local History Plugin - Entry Point
 *
 * Step 1: Scaffold — empty activate/deactivate shell.
 */

import type { PluginContext } from './types'

export async function activate(ctx: PluginContext): Promise<void> {
  console.log('[local-history] Plugin activated')
}

export function deactivate(): void {
  console.log('[local-history] Plugin deactivated')
}
