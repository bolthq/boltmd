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
}
