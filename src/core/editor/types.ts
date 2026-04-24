// 编辑器模式
export type EditorMode = 'wysiwyg' | 'source' | 'split'

// 光标位置
export interface CursorPosition {
  line: number
  column: number
  offset: number
}

// 字数统计
export interface WordCount {
  characters: number
  words: number
  lines: number
}

// 编辑器快照（标签切换/模式切换时保存恢复用）
export interface EditorSnapshot {
  content: string
  cursor: CursorPosition
  scroll: number
  mode: EditorMode
}

// 搜索选项
export interface SearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

// 搜索状态
// total: 匹配总数；current: 当前匹配项索引（1-based，0 = 无匹配）
// error: 正则语法错误信息（仅 regex=true 时可能出现）
export interface SearchState {
  total: number
  current: number
  error?: string
}

// 编辑器实例统一接口
export interface IEditor {
  getContent(): string
  setContent(markdown: string): void
  focus(): void
  getCursorPosition(): CursorPosition
  setCursorPosition(pos: CursorPosition): void
  getScrollPosition(): number
  setScrollPosition(pos: number): void
  getSelection(): string
  insertText(text: string): void
  undo(): void
  redo(): void
  destroy(): void
  onContentChange(callback: (markdown: string) => void): void
  getWordCount(): WordCount

  // 查找/替换
  search(query: string, options: SearchOptions): SearchState
  gotoNextMatch(): SearchState
  gotoPrevMatch(): SearchState
  replaceNext(replacement: string): SearchState
  replaceAll(replacement: string): number
  clearSearch(): void
}
