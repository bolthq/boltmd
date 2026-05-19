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
