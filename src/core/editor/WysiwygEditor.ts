import type { Extensions } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import type { Editor } from '@tiptap/core'
import type { IEditor, CursorPosition, WordCount, SearchOptions, SearchState, DocTransfer } from './types'
import { t } from '../../i18n'
import { SearchAndReplace, searchPluginKey } from './extensions/SearchAndReplace'
import { HeadingHighlight } from './extensions/HeadingHighlight'
import { serializeMarkdown, pmOffsetToTextOffset, textOffsetToPmOffset } from './serializer/MarkdownSerializer'
import { parseMarkdown } from './parser/MarkdownParser'
import {
  FormatHeading,
  FormatBold,
  FormatItalic,
  FormatStrike,
  FormatCode,
  FormatBulletList,
  FormatOrderedList,
  FormatBlockquote,
  FormatHorizontalRule,
} from './extensions/FormatAttrs'

// 懒初始化 lowlight，避免模块加载时同步解析所有语言语法
let _lowlight: any = null
// Callbacks to invoke once lowlight is ready (editors need to re-highlight).
const _onLowlightReady: Array<() => void> = []

async function getLowlight() {
  if (!_lowlight) {
    const { common, createLowlight } = await import('lowlight')
    _lowlight = createLowlight(common)
    // Notify all waiting editors to re-render code blocks.
    _onLowlightReady.forEach((cb) => cb())
    _onLowlightReady.length = 0
  }
  return _lowlight
}

/** Check if lowlight has already been loaded. */
export function isLowlightLoaded(): boolean {
  return _lowlight !== null
}

/** Register a callback to be called when lowlight finishes loading.
 *  If already loaded, the callback is invoked immediately. */
export function onLowlightReady(cb: () => void): void {
  if (_lowlight) {
    cb()
  } else {
    _onLowlightReady.push(cb)
  }
}

// 预热：在空闲时异步加载 lowlight，不阻塞首次渲染
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => getLowlight())
} else {
  setTimeout(() => getLowlight(), 100)
}

// 返回编辑器扩展列表，供 useEditor() 使用
export function createWysiwygExtensions(): Extensions {
  return [
    StarterKit.configure({
      // Disable extensions replaced by Format* variants with format-preserving attrs
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      horizontalRule: false,
    }),
    // Format-preserving extensions (add prefix/delimiter/marker/fence/syntax attrs)
    FormatHeading,
    FormatBold,
    FormatItalic,
    FormatStrike,
    FormatCode,
    FormatBulletList,
    FormatOrderedList,
    FormatBlockquote,
    FormatHorizontalRule,
    Placeholder.configure({
      placeholder: () => t('editor.placeholder'),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    // CodeBlockLowlight with format-preserving `fence` attr (``` or ~~~).
    CodeBlockLowlight.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          fence: {
            default: '```',
            renderHTML: () => ({}),
            parseHTML: () => '```',
          },
        }
      },
    }).configure({
      lowlight: {
        listLanguages: () => _lowlight?.listLanguages() ?? [],
        highlight: (lang: string, code: string) =>
          _lowlight?.highlight(lang, code) ?? { type: 'root', children: [{ type: 'text', value: code }] } as any,
        highlightAuto: (code: string) =>
          _lowlight?.highlightAuto(code) ?? { type: 'root', children: [{ type: 'text', value: code }] } as any,
        registered: (lang: string) => _lowlight?.registered(lang) ?? false,
      } as any,
    }),
    Highlight.configure({ multicolor: true }),
    Image.configure({ inline: true, allowBase64: true }),
    Markdown.configure({
      html: true,
      transformCopiedText: false,
      transformPastedText: true,
    }),
    SearchAndReplace,
    HeadingHighlight,
  ]
}

// 将 Tiptap Editor 实例包装为 IEditor 接口
export class WysiwygEditor implements IEditor {
  private editor: Editor
  private contentChangeCallbacks: ((markdown: string) => void)[] = []
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** When true, the onUpdate callback is suppressed so that programmatic
   *  setContent() calls don't trigger a normalised-markdown writeback. */
  private suppressUpdate = false

  constructor(editor: Editor) {
    this.editor = editor

    // Debounced serialization: avoid traversing the full AST on every keystroke.
    this.editor.on('update', () => {
      if (this.suppressUpdate) return
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        if (this.suppressUpdate) return
        const md = serializeMarkdown(this.editor.state.doc)
        this.contentChangeCallbacks.forEach(cb => cb(md))
      }, 150)
    })
  }

  getContent(): string {
    return serializeMarkdown(this.editor.state.doc)
  }

  setContent(markdown: string, recordInHistory = false): void {
    // Normalize CRLF → LF so that Windows line endings don't cause
    // unnecessary doc rebuilds (serializer always outputs LF).
    const normalized = markdown.replace(/\r\n/g, '\n')

    // Skip if the editor's current markdown is already identical to avoid
    // unnecessary full document rebuild (which causes table/layout flicker).
    const current = serializeMarkdown(this.editor.state.doc)
    if (current === normalized) {
      return
    }

    // Suppress the onUpdate → serialize callback so that internal
    // normalisation doesn't fire onChange back to tabStore.
    this.suppressUpdate = true
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // Parse markdown directly into a ProseMirror document using our parser.
    const { schema } = this.editor.state
    const doc = parseMarkdown(schema, normalized)
    const { tr } = this.editor.state
    tr.replaceWith(0, tr.doc.content.size, doc.content)
    if (!recordInHistory) {
      tr.setMeta('addToHistory', false)
    }
    tr.setMeta('preventUpdate', false)
    this.editor.view.dispatch(tr)

    // Re-enable update callbacks after a delay that exceeds the 150ms
    // debounce timer, ensuring no stale callback sneaks through.
    setTimeout(() => {
      this.suppressUpdate = false
    }, 200)
  }

  /** Clear PM undo history when switching tabs (not mode switches). */
  resetForTabSwitch(): void {
    // Find the history plugin by its key prefix (prosemirror-history uses key "history$").
    const historyPlugin = this.editor.state.plugins.find(
      (p) => (p as any).key === 'history$',
    )
    if (!historyPlugin) return

    // Get current history state; skip if already empty.
    const currentHist = historyPlugin.getState(this.editor.state)
    if (!currentHist || (currentHist.done.eventCount === 0 && currentHist.undone.eventCount === 0)) {
      return
    }

    // Dispatch a transaction with a meta value that the history plugin's
    // apply function recognises as a direct state override.
    // prosemirror-history: if tr.getMeta(plugin) has `historyState`, it adopts it.
    const { tr } = this.editor.state
    const BranchClass = currentHist.done.constructor
    const emptyHist = {
      done: BranchClass.empty,
      undone: BranchClass.empty,
      prevRanges: null,
      prevTime: 0,
      prevComposition: -1,
    }
    tr.setMeta(historyPlugin, { redo: false, historyState: emptyHist })
    tr.setMeta('addToHistory', false)
    this.editor.view.dispatch(tr)
  }

  focus(): void {
    this.editor.commands.focus()
  }

  getCursorPosition(): CursorPosition {
    const { from } = this.editor.state.selection
    const resolved = this.editor.state.doc.resolve(from)
    const blockIndex = resolved.depth > 0 ? resolved.index(0) : 0

    // Compute the actual source line number by mapping block index to
    // serialized markdown lines.  Block index alone is wrong because
    // tables, code blocks, lists each span multiple source lines.
    const md = serializeMarkdown(this.editor.state.doc)
    let sourceLine = this.blockToSourceLine(md, blockIndex)

    // Add intra-block offset for compound blocks (lists, tables, code blocks).
    const topNode = this.editor.state.doc.maybeChild(blockIndex)
    if (topNode) {
      sourceLine += this.computeIntraBlockOffset(topNode, resolved)
    }

    // Convert from 0-based line index to 1-based line number.
    return {
      line: sourceLine + 1,
      column: resolved.parentOffset,
      offset: from,
    }
  }

  /** Compute how many extra source lines into a compound block the cursor is.
   *  For simple blocks (paragraph, heading) this is always 0. */
  private computeIntraBlockOffset(topNode: any, resolved: any): number {
    const nodeType: string = topNode.type.name

    if (nodeType === 'bulletList' || nodeType === 'orderedList') {
      // Each list item is one source line (for tight lists).
      // resolved.index(1) gives the listItem index within the list.
      if (resolved.depth >= 2) {
        return resolved.index(1)
      }
    }

    if (nodeType === 'table') {
      // Table serialization: row 0 = header (line 0), separator (line 1),
      // row N (N>0) = line N+1.  resolved.index(1) = tableRow index.
      if (resolved.depth >= 2) {
        const rowIndex = resolved.index(1)
        return rowIndex === 0 ? 0 : rowIndex + 1
      }
    }

    if (nodeType === 'codeBlock') {
      // Opening fence is line 0 of the block. Code content starts at line 1.
      // Count newlines in the text content up to the cursor's parentOffset.
      const textOffset = resolved.depth >= 1 ? resolved.parentOffset : 0
      const text = topNode.textContent.slice(0, textOffset)
      const newlines = (text.match(/\n/g) || []).length
      return newlines + 1 // +1 for the opening fence line
    }

    return 0
  }

  /** Map a PM top-level block index to the corresponding source line number.
   *  Walks through the serialized markdown counting block boundaries
   *  (blank lines between blocks, respecting fenced code blocks). */
  private blockToSourceLine(markdown: string, blockIndex: number): number {
    if (blockIndex <= 0) return 0

    const lines = markdown.split('\n')
    let block = 0
    let inFence = false

    for (let i = 0; i < lines.length; i++) {
      if (block >= blockIndex) return i

      const line = lines[i]

      // Track fenced code blocks (opening)
      if (!inFence && /^(`{3,}|~{3,})/.test(line)) {
        inFence = true
        continue
      }
      // Track fenced code blocks (closing)
      if (inFence) {
        if (/^(`{3,}|~{3,})\s*$/.test(line)) {
          inFence = false
        }
        continue
      }

      // A blank line after non-blank content marks a block boundary
      if (line === '' && i > 0 && lines[i - 1] !== '') {
        block++
      }
    }

    return lines.length - 1
  }

  /** Inverse of blockToSourceLine: given a source line number, find which
   *  PM top-level block it belongs to. */
  private sourceLineToBlock(markdown: string, targetLine: number): number {
    const lines = markdown.split('\n')
    let block = 0
    let inFence = false

    for (let i = 0; i < lines.length && i < targetLine; i++) {
      const line = lines[i]

      if (!inFence && /^(`{3,}|~{3,})/.test(line)) {
        inFence = true
        continue
      }
      if (inFence) {
        if (/^(`{3,}|~{3,})\s*$/.test(line)) {
          inFence = false
        }
        continue
      }

      if (line === '' && i > 0 && lines[i - 1] !== '') {
        block++
      }
    }

    return block
  }

  setCursorPosition(pos: CursorPosition): void {
    const doc = this.editor.state.doc
    const docSize = doc.content.size
    let offset = pos.offset

    if (offset > 0 && offset <= docSize) {
      // Valid PM offset provided (e.g. restoring same-mode position).
      // Just use it directly.
    } else if (pos.line > 0) {
      // Resolve from source line number → PM block index → PM offset.
      const md = serializeMarkdown(this.editor.state.doc)
      const blockIndex = this.sourceLineToBlock(md, pos.line)
      const clampedBlock = Math.min(blockIndex, doc.childCount - 1)
      let blockOffset = 0
      for (let i = 0; i < clampedBlock; i++) {
        blockOffset += doc.child(i).nodeSize
      }
      offset = Math.min(blockOffset + 1, docSize)

      // Compute intra-block offset: if the target line is inside a compound
      // block (list, table, code block), navigate to the right sub-position.
      const topNode = doc.maybeChild(clampedBlock)
      if (topNode) {
        const blockFirstLine = this.blockToSourceLine(md, clampedBlock)
        // pos.line is 1-based, blockFirstLine is 0-based index; convert to same base.
        const lineWithinBlock = (pos.line - 1) - blockFirstLine
        if (lineWithinBlock > 0) {
          const intraOffset = this.resolveIntraBlockPosition(topNode, lineWithinBlock, blockOffset)
          if (intraOffset >= 0) {
            offset = Math.min(intraOffset, docSize)
          }
        }
      }
    } else {
      offset = 1 // Beginning of first block
    }

    offset = Math.min(Math.max(offset, 0), docSize)
    this.editor.commands.setTextSelection(offset)
    this.editor.commands.scrollIntoView()
  }

  /** Given a compound top-level node and a line offset within it, return
   *  the PM position to place the cursor at. Returns -1 if not applicable. */
  private resolveIntraBlockPosition(topNode: any, lineWithinBlock: number, blockStartOffset: number): number {
    const nodeType: string = topNode.type.name

    if (nodeType === 'bulletList' || nodeType === 'orderedList') {
      // lineWithinBlock corresponds to the Nth list item (0-indexed).
      const targetItem = Math.min(lineWithinBlock, topNode.childCount - 1)
      // Walk list items to find the offset of the target item.
      let pos = blockStartOffset + 1 // +1 to enter the list node
      for (let i = 0; i < targetItem; i++) {
        pos += topNode.child(i).nodeSize
      }
      return pos + 2 // +1 enter listItem, +1 enter paragraph
    }

    if (nodeType === 'table') {
      // lineWithinBlock: 0=header, 1=separator(skip), 2+=data rows
      // Map to row index: line 0→row 0, line 1→row 0(sep), line 2+→row N-1
      let targetRow = 0
      if (lineWithinBlock >= 2) {
        targetRow = lineWithinBlock - 1
      }
      targetRow = Math.min(targetRow, topNode.childCount - 1)
      // Walk table rows to find the position of the target row.
      let pos = blockStartOffset + 1 // +1 to enter the table node
      for (let i = 0; i < targetRow; i++) {
        pos += topNode.child(i).nodeSize
      }
      return pos + 3 // +1 enter tableRow, +1 enter tableCell, +1 enter paragraph
    }

    if (nodeType === 'codeBlock') {
      // lineWithinBlock includes +1 for the fence line, so actual text line
      // is lineWithinBlock - 1.
      const targetTextLine = lineWithinBlock - 1
      if (targetTextLine < 0) return blockStartOffset + 1
      // Count newlines in text to find the offset of the target line.
      const text = topNode.textContent
      let charOffset = 0
      let lineCount = 0
      for (let i = 0; i < text.length; i++) {
        if (lineCount >= targetTextLine) break
        if (text[i] === '\n') lineCount++
        charOffset = i + 1
      }
      return blockStartOffset + 1 + charOffset
    }

    return -1
  }

  /**
   * Jump to a specific heading by its index in the document.
   * Used by OutlinePanel for heading navigation with center-scroll + highlight.
   */
  jumpToHeading(headingIndex: number): void {
    const doc = this.editor.state.doc
    const docSize = doc.content.size
    let headingCount = 0
    let targetPos = -1
    let headingNodePos = -1

    doc.descendants((node, nodePos) => {
      if (targetPos >= 0) return false
      if (node.type.name === 'heading') {
        if (headingCount === headingIndex) {
          targetPos = nodePos + 1
          headingNodePos = nodePos
          return false
        }
        headingCount++
      }
      return true
    })

    let offset: number
    if (targetPos >= 0) {
      offset = Math.min(targetPos, docSize)
    } else {
      offset = 1
    }

    this.editor.commands.setTextSelection(offset)
    this.editor.commands.scrollIntoView()

    // Scroll to center and flash highlight.
    const savedHeadingNodePos = headingNodePos
    setTimeout(() => {
      try {
        const dom = this.editor.view.domAtPos(offset)
        const node = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
        if (node) {
          const container = this.editor.view.dom.closest('.editor-mount') as HTMLElement
          if (container) {
            const nodeRect = node.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            const targetTop = nodeRect.top - containerRect.top + container.scrollTop
            container.scrollTop = targetTop - container.clientHeight / 2
          } else {
            node.scrollIntoView({ block: 'center' })
          }
        }
        if (savedHeadingNodePos >= 0) {
          this.editor.commands.flashHeading(savedHeadingNodePos)
          setTimeout(() => {
            this.editor.commands.clearHeadingHighlight()
          }, 1500)
        }
      } catch {
        // ignore
      }
    }, 0)
  }

  flashCursorLine(): void {
    try {
      // Scroll cursor to the center of the viewport
      const { from } = this.editor.state.selection
      const coords = this.editor.view.coordsAtPos(from)
      const container = this.editor.view.dom.closest('.editor-mount') as HTMLElement
      if (container && coords) {
        const containerRect = container.getBoundingClientRect()
        const targetTop = coords.top - containerRect.top + container.scrollTop
        container.scrollTop = targetTop - container.clientHeight / 2
      }

      this.editor.commands.flashCursorBlock()
      setTimeout(() => {
        this.editor.commands.clearHeadingHighlight()
      }, 2600)
    } catch {
      // ignore
    }
  }

  getScrollPosition(): number {
    const el = this.editor.view.dom.closest('.editor-mount') as HTMLElement
    return el?.scrollTop ?? 0
  }

  setScrollPosition(pos: number): void {
    const el = this.editor.view.dom.closest('.editor-mount') as HTMLElement
    if (el) el.scrollTop = pos
  }

  getSelection(): string {
    const { from, to } = this.editor.state.selection
    return this.editor.state.doc.textBetween(from, to)
  }

  insertText(text: string): void {
    this.editor.commands.insertContent(text)
  }

  undo(): void {
    this.editor.commands.undo()
  }

  redo(): void {
    this.editor.commands.redo()
  }

  destroy(): void {
    // Editor 由 useEditor 管理，不在此销毁
  }

  onContentChange(callback: (markdown: string) => void): void {
    this.contentChangeCallbacks.push(callback)
  }

  getWordCount(): WordCount {
    const text = this.editor.getText()
    const characters = text.length
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    const lines = this.editor.state.doc.childCount
    return { characters, words, lines }
  }

  // ---- 查找 / 替换 ----

  /** 从插件状态构造 SearchState（1-based current，0 = 无匹配） */
  private readSearchState(): SearchState {
    const plugin = searchPluginKey.getState(this.editor.state)
    if (!plugin) return { total: 0, current: 0 }
    return {
      total: plugin.results.length,
      current: plugin.currentIndex >= 0 ? plugin.currentIndex + 1 : 0,
      error: plugin.error ?? undefined,
    }
  }

  /** 跳转当前匹配到视口内 */
  private scrollCurrentMatchIntoView(): void {
    const plugin = searchPluginKey.getState(this.editor.state)
    if (!plugin || plugin.currentIndex < 0) return
    const range = plugin.results[plugin.currentIndex]
    if (!range) return
    try {
      const dom = this.editor.view.domAtPos(range.from)
      const node = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    } catch {
      // 某些位置可能取不到 DOM，忽略
    }
  }

  search(query: string, options: SearchOptions): SearchState {
    this.editor.commands.setSearchTerm(query, options)
    this.scrollCurrentMatchIntoView()
    return this.readSearchState()
  }

  gotoNextMatch(): SearchState {
    this.editor.commands.nextSearchResult()
    this.scrollCurrentMatchIntoView()
    return this.readSearchState()
  }

  gotoPrevMatch(): SearchState {
    this.editor.commands.prevSearchResult()
    this.scrollCurrentMatchIntoView()
    return this.readSearchState()
  }

  replaceNext(replacement: string): SearchState {
    this.editor.commands.replaceCurrent(replacement)
    this.scrollCurrentMatchIntoView()
    return this.readSearchState()
  }

  replaceAll(replacement: string): number {
    const before = searchPluginKey.getState(this.editor.state)?.results.length ?? 0
    if (before === 0) return 0
    this.editor.commands.replaceAllMatches(replacement)
    return before
  }

  clearSearch(): void {
    this.editor.commands.clearSearch()
  }

  // ---- Direct document transfer ----

  getDocTransfer(): DocTransfer {
    // Flush pending debounce to ensure content callbacks are up-to-date.
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      const md = serializeMarkdown(this.editor.state.doc)
      this.contentChangeCallbacks.forEach(cb => cb(md))
    }

    const { from, to } = this.editor.state.selection
    const markdown = serializeMarkdown(this.editor.state.doc)
    const cursorPos = this.getCursorPosition()
    // Compute precise text offset in serialized markdown.
    const textOffset = pmOffsetToTextOffset(this.editor.state.doc, from)
    return {
      doc: this.editor.state.doc,
      selectionFrom: from,
      selectionTo: to,
      markdown,
      cursorLine: cursorPos.line,
      cursorColumn: cursorPos.column,
      textOffset,
    }
  }

  setDocTransfer(transfer: DocTransfer): void {
    this.suppressUpdate = true
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    const { tr } = this.editor.state

    // If markdown is provided (from source editor), check if canonical doc
    // is already up-to-date (syncToCanonical keeps it current). If so, skip
    // the expensive parse + replaceWith — only restore cursor position.
    let docReplaced = false
    if (transfer.markdown !== undefined) {
      const currentMd = serializeMarkdown(this.editor.state.doc)
      if (currentMd !== transfer.markdown) {
        const doc = parseMarkdown(this.editor.state.schema, transfer.markdown)
        tr.replaceWith(0, tr.doc.content.size, doc.content)
        docReplaced = true
      }
    } else {
      tr.replaceWith(0, tr.doc.content.size, transfer.doc.content)
      docReplaced = true
    }

    tr.setMeta('addToHistory', false)

    // Restore cursor position.
    // Priority: textOffset (precise) > selectionFrom (same-schema PM offset).
    const doc = tr.doc
    const docSize = doc.content.size
    let offset: number | null = null

    if (transfer.textOffset !== undefined && transfer.textOffset >= 0) {
      // Precise mapping: convert markdown text offset → PM offset.
      offset = textOffsetToPmOffset(doc, transfer.textOffset)
    } else if (transfer.selectionFrom && transfer.selectionFrom > 0 && transfer.selectionFrom <= docSize) {
      offset = transfer.selectionFrom
    }

    if (offset !== null) {
      offset = Math.min(Math.max(offset, 0), docSize)
      try {
        const $pos = doc.resolve(offset)
        const selection = Selection.near($pos)
        tr.setSelection(selection)
      } catch { /* ignore */ }
    }

    if (docReplaced || tr.selectionSet) {
      this.editor.view.dispatch(tr)
    }

    setTimeout(() => {
      this.suppressUpdate = false
    }, 200)
  }

  /** Expose the underlying Tiptap Editor instance (for source mode dispatch). */
  getTiptapEditor(): Editor {
    return this.editor
  }
}
