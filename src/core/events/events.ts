// 预定义事件名常量（类型安全）
export const AppEvent = {
  FileOpened: 'file:opened',
  FileSaved: 'file:saved',
  FileExternalChange: 'file:external-change',
  EditorContentChange: 'editor:content-change',
  EditorModeChange: 'editor:mode-change',
  TabSwitch: 'tab:switch',
  TabClose: 'tab:close',
  ThemeChange: 'theme:change',
  ConfigChange: 'config:change',
  Error: 'app:error',
} as const

export type AppEventName = (typeof AppEvent)[keyof typeof AppEvent]
