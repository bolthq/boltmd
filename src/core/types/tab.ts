import type { EditorMode, CursorPosition } from '../editor/types'

export interface TabState {
  id: string
  filePath: string | null       // null = 新建未保存
  fileName: string
  content: string
  dirty: boolean
  editorMode: EditorMode
  cursorPosition: CursorPosition
  scrollPosition: number
  lastModified: number
}

export interface ITabManager {
  getTabs(): TabState[]
  getActiveTab(): TabState | null
  createTab(): TabState
  openTab(filePath: string, content: string): TabState
  closeTab(tabId: string): Promise<boolean>
  switchTab(tabId: string): void
  updateTabContent(tabId: string, content: string): void
  markSaved(tabId: string, filePath: string): void
  moveTab(fromIndex: number, toIndex: number): void
  closeOtherTabs(tabId: string): void
  closeTabsToRight(tabId: string): void
  saveSession(): void
  restoreSession(): void
}
