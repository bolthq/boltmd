import type { EditorMode } from '../editor/types'

export type ThemeName = 'light' | 'dark' | 'system'

export interface AppConfig {
  theme: ThemeName
  fontSize: number
  fontFamily: string
  lineHeight: number
  tabSize: number
  wordWrap: boolean
  autoSave: boolean
  autoSaveDelay: number  // ms
  defaultMode: EditorMode
  showLineNumbers: boolean
  showToolbar: boolean
  imageStorePath: 'relative' | 'absolute'
  language: string
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'light',
  fontSize: 15,
  fontFamily: 'system-ui, sans-serif',
  lineHeight: 1.6,
  tabSize: 2,
  wordWrap: true,
  autoSave: false,
  autoSaveDelay: 3000,
  defaultMode: 'wysiwyg',
  showLineNumbers: true,
  showToolbar: true,
  imageStorePath: 'relative',
  language: 'zh-CN',
}
