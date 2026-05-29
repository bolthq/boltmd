// PluginManager: reactive registries, plugin instance state, and registration
// functions. Does NOT import PluginContext (no circular dependency).
// Activation orchestration lives in App.vue.

import { ref, type Ref } from 'vue'
import type {
  PluginInstance,
  PluginModule,
  PluginContext,
  PluginCommandDefinition,
  PluginStatusBarItem,
  PluginSidebarPanel,
} from './types'

// ---------------------------------------------------------------------------
// Reactive registries (consumed by UI components)
// ---------------------------------------------------------------------------

/** All commands registered by plugins. */
export const pluginCommands: Ref<PluginCommandDefinition[]> = ref([])

/** All status bar items registered by plugins. */
export const pluginStatusBarItems: Ref<PluginStatusBarItem[]> = ref([])

/** All sidebar panels registered by plugins. */
export const pluginSidebarPanels: Ref<PluginSidebarPanel[]> = ref([])

/** All loaded plugin instances (for settings panel display). */
export const pluginInstances: Ref<PluginInstance[]> = ref([])

/** Shortcut → command ID mapping for keyboard binding. */
export const shortcutRegistry: Ref<Map<string, string>> = ref(new Map())

// ---------------------------------------------------------------------------
// Registration functions (called by PluginContext)
// ---------------------------------------------------------------------------

export function registerCommand(_pluginId: string, command: PluginCommandDefinition): void {
  pluginCommands.value = [...pluginCommands.value, command]

  // Bind shortcut if declared.
  if (command.shortcut) {
    const key = normalizeShortcut(command.shortcut)
    if (shortcutRegistry.value.has(key)) {
      console.warn(
        `[PluginManager] Shortcut "${command.shortcut}" already bound to "${shortcutRegistry.value.get(key)}". Overwritten by "${command.id}".`
      )
    }
    const next = new Map(shortcutRegistry.value)
    next.set(key, command.id)
    shortcutRegistry.value = next
  }
}

export function unregisterCommand(_pluginId: string, commandId: string): void {
  const cmd = pluginCommands.value.find(c => c.id === commandId)
  pluginCommands.value = pluginCommands.value.filter(c => c.id !== commandId)

  // Remove shortcut binding.
  if (cmd?.shortcut) {
    const key = normalizeShortcut(cmd.shortcut)
    if (shortcutRegistry.value.get(key) === commandId) {
      const next = new Map(shortcutRegistry.value)
      next.delete(key)
      shortcutRegistry.value = next
    }
  }
}

export function registerStatusBarItem(_pluginId: string, item: PluginStatusBarItem): void {
  pluginStatusBarItems.value = [...pluginStatusBarItems.value, item]
}

export function updateStatusBarItem(
  _pluginId: string,
  itemId: string,
  updates: Partial<Pick<PluginStatusBarItem, 'text' | 'tooltip'>>,
): void {
  pluginStatusBarItems.value = pluginStatusBarItems.value.map(item =>
    item.id === itemId ? { ...item, ...updates } : item
  )
}

export function removeStatusBarItem(_pluginId: string, itemId: string): void {
  pluginStatusBarItems.value = pluginStatusBarItems.value.filter(i => i.id !== itemId)
}

export function registerSidebarPanel(_pluginId: string, panel: PluginSidebarPanel): void {
  pluginSidebarPanels.value = [...pluginSidebarPanels.value, panel]
}

export function unregisterSidebarPanel(_pluginId: string, panelId: string): void {
  pluginSidebarPanels.value = pluginSidebarPanels.value.filter(p => p.id !== panelId)
}

// ---------------------------------------------------------------------------
// Plugin instance state management
// ---------------------------------------------------------------------------

/** Store a plugin instance (called during loading phase). Deduplicates by ID. */
export function addPluginInstance(instance: PluginInstance): void {
  // Skip if already registered (prevents duplicates from multiple scan sources or HMR).
  if (pluginInstances.value.some(p => p.manifest.id === instance.manifest.id)) {
    return
  }
  pluginInstances.value = [...pluginInstances.value, instance]
}

/** Update a plugin instance's state (active/error/inactive). */
export function updatePluginState(
  pluginId: string,
  state: PluginInstance['state'],
  error?: string | null,
): void {
  pluginInstances.value = pluginInstances.value.map(p =>
    p.manifest.id === pluginId
      ? { ...p, state, error: error ?? null }
      : p
  )
}

/** Store module and context on a plugin instance after successful activation. */
export function setPluginActivated(
  pluginId: string,
  module: PluginModule,
  context: PluginContext,
): void {
  pluginInstances.value = pluginInstances.value.map(p =>
    p.manifest.id === pluginId
      ? { ...p, state: 'active', module, context, error: null }
      : p
  )
}

/** Clear module/context after deactivation. */
export function setPluginDeactivated(pluginId: string): void {
  pluginInstances.value = pluginInstances.value.map(p =>
    p.manifest.id === pluginId
      ? { ...p, state: 'inactive', module: null, context: null }
      : p
  )
}

/** Remove all registrations belonging to a specific plugin. */
export function cleanupPlugin(pluginId: string): void {
  // Remove commands and their shortcut bindings.
  const cmds = pluginCommands.value.filter(c => c.id.startsWith(`${pluginId}.`))
  for (const cmd of cmds) {
    if (cmd.shortcut) {
      const key = normalizeShortcut(cmd.shortcut)
      if (shortcutRegistry.value.get(key) === cmd.id) {
        const next = new Map(shortcutRegistry.value)
        next.delete(key)
        shortcutRegistry.value = next
      }
    }
  }
  pluginCommands.value = pluginCommands.value.filter(c => !c.id.startsWith(`${pluginId}.`))

  // Remove status bar items (prefixed with pluginId).
  pluginStatusBarItems.value = pluginStatusBarItems.value.filter(
    i => !i.id.startsWith(`${pluginId}.`)
  )

  // Remove sidebar panels (prefixed with pluginId).
  pluginSidebarPanels.value = pluginSidebarPanels.value.filter(
    p => !p.id.startsWith(`${pluginId}.`)
  )
}

/** Reset all registries (used by reload command). */
export function resetAll(): void {
  pluginCommands.value = []
  pluginStatusBarItems.value = []
  pluginSidebarPanels.value = []
  pluginInstances.value = []
  shortcutRegistry.value = new Map()
}

// ---------------------------------------------------------------------------
// Shortcut normalization
// ---------------------------------------------------------------------------

/** Normalize a shortcut string for consistent map lookup.
 *  e.g. "ctrl+shift+h" → "ctrl+shift+h" (lowercase, sorted modifiers). */
function normalizeShortcut(shortcut: string): string {
  const parts = shortcut.toLowerCase().split('+').map(s => s.trim())
  const key = parts.pop() || ''
  const modifiers = parts.sort()
  return [...modifiers, key].join('+')
}

/** Normalize a KeyboardEvent into the same format as normalizeShortcut.
 *  Used by App.vue handleKeydown to look up plugin shortcuts. */
export function eventToShortcut(e: KeyboardEvent): string {
  const modifiers: string[] = []
  if (e.ctrlKey || e.metaKey) modifiers.push('ctrl')
  if (e.shiftKey) modifiers.push('shift')
  if (e.altKey) modifiers.push('alt')
  modifiers.sort()

  const key = e.key.toLowerCase()
  return [...modifiers, key].join('+')
}

/** Look up a command ID by shortcut string. Returns undefined if not found. */
export function findCommandByShortcut(shortcut: string): string | undefined {
  return shortcutRegistry.value.get(shortcut)
}

/** Find a command definition by ID. */
export function findCommandById(commandId: string): PluginCommandDefinition | undefined {
  return pluginCommands.value.find(c => c.id === commandId)
}
