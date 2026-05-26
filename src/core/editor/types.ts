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

/**
 * Document transfer object for direct doc sharing between editors.
 * Used during mode switching to avoid serialize/parse round-trips.
 */
export interface DocTransfer {
  /** The ProseMirror document node (same schema required for direct transfer) */
  doc: any // PMNode — use `any` to avoid importing PM in the types file
  /** Selection offset (cursor position in the document) */
  selectionFrom: number
  selectionTo: number
  /** Raw markdown text — used when schemas differ (e.g., source ↔ WYSIWYG).
   *  When present, the receiver should parse this with its own schema instead of using `doc`. */
  markdown?: string
  /** Cursor line number (1-based) for cross-schema cursor mapping. */
  cursorLine?: number
  /** Cursor column (0-based character offset within the line). */
  cursorColumn?: number
  /** Exact character offset of the cursor in the serialized markdown text.
   *  This provides precise cross-mode cursor mapping without line/column rounding. */
  textOffset?: number
}

// 编辑器实例统一接口
export interface IEditor {
  getContent(): string
  setContent(markdown: string, recordInHistory?: boolean): void
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

  // Heading navigation (used by OutlinePanel / command palette)
  jumpToHeading(headingIndex: number): void

  // Optional: clear undo history for tab switch (not mode switch)
  resetForTabSwitch?(): void

  // Optional: flash the cursor's current line/block after mode switch
  flashCursorLine?(): void

  // --- Direct document transfer (shared PM doc between modes) ---

  /** Get the current PM document and selection for direct transfer. */
  getDocTransfer(): DocTransfer

  /** Set the PM document directly from another editor's doc (no serialize/parse). */
  setDocTransfer(transfer: DocTransfer): void

  // 查找/替换
  search(query: string, options: SearchOptions): SearchState
  gotoNextMatch(): SearchState
  gotoPrevMatch(): SearchState
  replaceNext(replacement: string): SearchState
  replaceAll(replacement: string): number
  clearSearch(): void
}
