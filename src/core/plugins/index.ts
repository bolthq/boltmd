// Plugin system barrel export.

export type {
  PluginPermission,
  PluginManifest,
  PluginModule,
  PluginState,
  PluginInstance,
  PluginContext,
  PluginEditorAPI,
  PluginCommandDefinition,
  PluginCommandsAPI,
  PluginStatusBarItem,
  PluginStatusBarAPI,
  PluginSidebarPanel,
  PluginSidebarAPI,
  PluginConfigAPI,
  PluginEventName,
  PluginEventsAPI,
  PluginFileSystemAPI,
} from './types'

export { scanPlugins } from './PluginLoader'
export type { LoadedPlugin, PluginValidationError, ScanResult } from './PluginLoader'

export {
  pluginCommands,
  pluginStatusBarItems,
  pluginSidebarPanels,
  pluginInstances,
  shortcutRegistry,
  registerCommand,
  unregisterCommand,
  registerStatusBarItem,
  updateStatusBarItem,
  removeStatusBarItem,
  registerSidebarPanel,
  unregisterSidebarPanel,
  addPluginInstance,
  updatePluginState,
  setPluginActivated,
  setPluginDeactivated,
  cleanupPlugin,
  resetAll,
  eventToShortcut,
  findCommandByShortcut,
  findCommandById,
} from './PluginManager'

export { createPluginContext, emitPluginEvent } from './PluginContext'
export type { PluginContextInternal } from './PluginContext'
