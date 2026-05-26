/**
 * PMSourceEditor — ProseMirror-based plain-text source editing mode.
 *
 * Uses a minimal schema (doc > codeBlock) so the entire markdown file is
 * editable as raw text. Users can freely modify ##, **, etc.
 *
 * All edits dispatch to the canonical Tiptap Editor (WYSIWYG schema) so that
 * PM's native history() plugin records them. Undo/redo is delegated to the
 * canonical editor — this ensures a single, unified undo stack across all modes.
 */

import { EditorView } from '@tiptap/pm/view'
import { EditorState, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Schema } from '@tiptap/pm/model'
import { keymap } from '@tiptap/pm/keymap'
import { baseKeymap } from '@tiptap/pm/commands'
import type { IEditor, CursorPosition, WordCount, SearchOptions, SearchState, DocTransfer } from './types'
import { serializeMarkdown } from './serializer/MarkdownSerializer'
import { parseMarkdown } from './parser/MarkdownParser'
import { reportCursorLine, reportActiveHeadingIndex, getTiptapEditor } from './EditorManager'
import { headingHighlightKey, createHighlightPlugin } from './extensions/HeadingHighlight'

// ---------------------------------------------------------------------------
// Source-mode schema: a single codeBlock holding raw markdown text.
// ---------------------------------------------------------------------------

let _sourceSchema: Schema | null = null

export function getSourceSchema(): Schema {
  if (_sourceSchema) return _sourceSchema
  _sourceSchema = new Schema({
    nodes: {
      doc: { content: 'codeBlock' },
      text: { inline: true },
      codeBlock: {
        content: 'text*',
        marks: '',
        code: true,
        defining: true,
        parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
        toDOM() { return ['pre', ['code', 0]] },
      },
    },
  })
  return _sourceSchema
}

// ---------------------------------------------------------------------------
// PMSourceEditor class
// ---------------------------------------------------------------------------

export class PMSourceEditor implements IEditor {
  private view: EditorView
  private contentChangeCallbacks: ((markdown: string) => void)[] = []
  private scrollEl: HTMLElement | null = null
  /** When true, suppress onContentChange callbacks (e.g. during undo/redo sync). */
  private suppressUpdate = false
  /** Pending timers that should be cleared on destroy. */
  private pendingTimers: ReturnType<typeof setTimeout>[] = []

  constructor(container: HTMLElement, markdown: string) {
    const schema = getSourceSchema()
    const doc = this.createDoc(schema, markdown)
    const plugins = [
      keymap({
        'Mod-z': () => { this.undo(); return true },
        'Mod-y': () => { this.redo(); return true },
        'Mod-Shift-z': () => { this.redo(); return true },
      }),
      keymap(baseKeymap),
      createHighlightPlugin(),
    ]
    const state = EditorState.create({ doc, plugins })

    this.view = new EditorView(container, {
      state,
      dispatchTransaction: (tr: Transaction) => {
        const newState = this.view.state.apply(tr)
        this.view.updateState(newState)

        if (tr.docChanged && !this.suppressUpdate) {
          const md = this.getContent()

          // Dispatch to canonical Tiptap Editor (records in PM history).
          this.syncToCanonical(md)

          for (const cb of this.contentChangeCallbacks) {
            try { cb(md) } catch { /* ignore */ }
          }
        }

        if (tr.docChanged || tr.selectionSet) {
          this.reportCursor()
        }
      },
    })

    this.scrollEl = container
    this.reportCursor()
  }

  // -------------------------------------------------------------------------
  // IEditor implementation
  // -------------------------------------------------------------------------

  getContent(): string {
    return this.view.state.doc.firstChild?.textContent ?? ''
  }

  setContent(markdown: string): void {
    this.suppressUpdate = true
    const schema = this.view.state.schema
    const doc = this.createDoc(schema, markdown)
    const tr = this.view.state.tr
    tr.replaceWith(0, tr.doc.content.size, doc.content)
    tr.setMeta('addToHistory', false)
    this.view.dispatch(tr)
    this.suppressUpdate = false
  }

  focus(): void {
    this.view.focus()
  }

  getCursorPosition(): CursorPosition {
    const { from } = this.view.state.selection
    const text = this.getContent()
    // codeBlock content starts at offset 1 (codeBlock open token only;
    // doc is the top-level node and doesn't add any position tokens).
    const textOffset = Math.max(0, from - 1)
    const before = text.slice(0, textOffset)
    const line = (before.match(/\n/g) || []).length + 1
    const lastNewline = before.lastIndexOf('\n')
    const column = textOffset - (lastNewline + 1)

    return { line, column, offset: from }
  }

  setCursorPosition(pos: CursorPosition): void {
    const doc = this.view.state.doc
    const docSize = doc.content.size

    let offset: number
    if (pos.offset > 0 && pos.offset <= docSize) {
      offset = pos.offset
    } else if (pos.line > 0) {
      // Convert line + column to text offset
      const text = this.getContent()
      const lines = text.split('\n')
      let charOffset = 0
      for (let i = 0; i < Math.min(pos.line - 1, lines.length); i++) {
        charOffset += lines[i].length + 1
      }
      charOffset += Math.min(pos.column || 0, (lines[pos.line - 1] || '').length)
      offset = charOffset + 1 // +1 for codeBlock open token
    } else {
      offset = 1 // Start of content
    }

    offset = Math.min(Math.max(0, offset), docSize)
    try {
      const $pos = doc.resolve(offset)
      const selection = Selection.near($pos)
      const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
      this.view.dispatch(tr)
    } catch { /* ignore */ }
  }

  getScrollPosition(): number {
    return this.scrollEl?.scrollTop ?? 0
  }

  setScrollPosition(pos: number): void {
    if (this.scrollEl) {
      this.scrollEl.scrollTop = pos
    }
  }

  getSelection(): string {
    const { from, to } = this.view.state.selection
    if (from === to) return ''
    return this.view.state.doc.textBetween(from, to, '\n')
  }

  insertText(text: string): void {
    const { from, to } = this.view.state.selection
    const tr = this.view.state.tr.insertText(text, from, to)
    this.view.dispatch(tr)
  }

  undo(): void {
    const tiptap = getTiptapEditor()
    if (!tiptap) return
    tiptap.commands.undo()
    // Sync canonical state back to source view.
    this.syncFromCanonical()
  }

  redo(): void {
    const tiptap = getTiptapEditor()
    if (!tiptap) return
    tiptap.commands.redo()
    // Sync canonical state back to source view.
    this.syncFromCanonical()
  }

  destroy(): void {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer)
    }
    this.pendingTimers = []
    this.view.destroy()
    this.contentChangeCallbacks = []
  }

  onContentChange(callback: (markdown: string) => void): void {
    this.contentChangeCallbacks.push(callback)
  }

  getWordCount(): WordCount {
    const text = this.getContent()
    const characters = text.length
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    const lines = text.split('\n').length
    return { characters, words, lines }
  }

  jumpToHeading(headingIndex: number): void {
    const text = this.getContent()
    const lines = text.split('\n')
    let count = 0

    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s/.test(lines[i])) {
        if (count === headingIndex) {
          let charOffset = 0
          for (let j = 0; j < i; j++) {
            charOffset += lines[j].length + 1
          }
          const offset = charOffset + 1
          const docSize = this.view.state.doc.content.size
          const clamped = Math.min(offset, docSize)
          try {
            const $pos = this.view.state.doc.resolve(clamped)
            const selection = Selection.near($pos)
            const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
            this.view.dispatch(tr)
          } catch { /* ignore */ }
          return
        }
        count++
      }
    }
  }

  resetForTabSwitch(): void {
    // History is managed by canonical Tiptap Editor — nothing to clear here.
  }

  flashCursorLine(): void {
    // Delay slightly to ensure DOM is visible and laid out
    // (covers v-show transitions where element was display:none).
    const doFlash = () => {
      const { from } = this.view.state.selection

      // Scroll to center
      try {
        const coords = this.view.coordsAtPos(from)
        if (this.scrollEl && coords && coords.top !== 0) {
          const containerRect = this.scrollEl.getBoundingClientRect()
          const targetTop = coords.top - containerRect.top + this.scrollEl.scrollTop
          this.scrollEl.scrollTop = targetTop - this.scrollEl.clientHeight / 2
        }
      } catch { /* ignore */ }

      // Flash the current line via PM Decoration
      try {
        const state = this.view.state
        const pos = state.selection.from
        const codeBlock = state.doc.firstChild
        if (!codeBlock) return

        const contentStart = 1
        const text = codeBlock.textContent
        if (text.length === 0) return

        const offset = Math.max(0, Math.min(pos - contentStart, text.length))
        const lineStart = text.lastIndexOf('\n', offset - 1) + 1
        let lineEnd = text.indexOf('\n', offset)
        if (lineEnd === -1) lineEnd = text.length

        // Handle empty lines: expand to include at least the newline character
        // so the decoration has a valid range.
        let inlineFrom = contentStart + lineStart
        let inlineTo = contentStart + lineEnd
        if (inlineFrom >= inlineTo) {
          // Empty line — try to flash the line including surrounding newline
          if (lineStart > 0) {
            inlineFrom = contentStart + lineStart - 1
          } else if (lineEnd < text.length) {
            inlineTo = contentStart + lineEnd + 1
          } else {
            // Single empty content — flash entire content
            inlineFrom = contentStart
            inlineTo = contentStart + text.length
          }
        }

        if (inlineFrom < inlineTo) {
          const tr = state.tr.setMeta(headingHighlightKey, { type: 'flashInline', from: inlineFrom, to: inlineTo })
          this.view.dispatch(tr)

          const timer = setTimeout(() => {
            try {
              const clearTr = this.view.state.tr.setMeta(headingHighlightKey, { type: 'clear' })
              this.view.dispatch(clearTr)
            } catch { /* view may be destroyed */ }
          }, 2600)
          this.pendingTimers.push(timer)
        }
      } catch { /* ignore */ }
    }

    // Use rAF to ensure the view is fully laid out before computing coords.
    requestAnimationFrame(doFlash)
  }

  // ---- DocTransfer ----

  getDocTransfer(): DocTransfer {
    const markdown = this.getContent()
    const { line, column } = this.getCursorPosition()
    // textOffset = cursor position within the raw markdown text.
    // In the source view, PM offset = textOffset + 1 (codeBlock open token only;
    // doc is the top-level node and doesn't add position tokens).
    const { from } = this.view.state.selection
    const textOffset = Math.max(0, from - 1)

    return {
      doc: this.view.state.doc,
      selectionFrom: this.view.state.selection.from,
      selectionTo: this.view.state.selection.from,
      markdown,
      cursorLine: line,
      cursorColumn: column,
      textOffset,
    }
  }

  setDocTransfer(transfer: DocTransfer): void {
    // Get markdown from transfer.
    let markdown: string
    if (transfer.markdown !== undefined) {
      markdown = transfer.markdown
    } else {
      try {
        markdown = serializeMarkdown(transfer.doc)
      } catch {
        markdown = transfer.doc.textContent || ''
      }
    }

    this.suppressUpdate = true

    const schema = this.view.state.schema
    const doc = this.createDoc(schema, markdown)
    const tr = this.view.state.tr
    tr.replaceWith(0, tr.doc.content.size, doc.content)
    tr.setMeta('addToHistory', false)

    // Restore cursor position using textOffset (precise).
    if (transfer.textOffset !== undefined && transfer.textOffset >= 0) {
      const targetOffset = Math.min(transfer.textOffset + 1, tr.doc.content.size)
      try {
        const $pos = tr.doc.resolve(targetOffset)
        const selection = Selection.near($pos)
        tr.setSelection(selection)
      } catch { /* ignore */ }
    } else if (transfer.cursorLine && transfer.cursorLine > 0) {
      // Fallback: use cursorLine + cursorColumn.
      const lines = markdown.split('\n')
      let charOffset = 0
      for (let i = 0; i < Math.min(transfer.cursorLine - 1, lines.length); i++) {
        charOffset += lines[i].length + 1
      }
      const lineIdx = transfer.cursorLine - 1
      const lineLength = lineIdx < lines.length ? lines[lineIdx].length : 0
      const col = Math.min(transfer.cursorColumn ?? 0, lineLength)
      charOffset += col
      const targetOffset = Math.min(charOffset + 1, tr.doc.content.size)
      try {
        const $pos = tr.doc.resolve(targetOffset)
        const selection = Selection.near($pos)
        tr.setSelection(selection)
      } catch { /* ignore */ }
    }

    this.view.dispatch(tr)
    this.suppressUpdate = false
  }

  // ---- Search / Replace ----

  search(query: string, options: SearchOptions): SearchState {
    if (!query) return { total: 0, current: 0 }
    const text = this.getContent()
    const regex = this.buildRegex(query, options)
    if (!regex) return { total: 0, current: 0, error: 'Invalid regex' }

    const matches = this.findAllMatches(text, regex)
    const current = this.findCurrentIndex(matches)
    if (matches.length > 0 && current === 0) {
      this.gotoMatch(matches[0])
      return { total: matches.length, current: 1 }
    }
    return { total: matches.length, current }
  }

  gotoNextMatch(): SearchState {
    return { total: 0, current: 0 }
  }

  gotoPrevMatch(): SearchState {
    return { total: 0, current: 0 }
  }

  replaceNext(replacement: string): SearchState {
    const { from, to } = this.view.state.selection
    if (from !== to) {
      const tr = this.view.state.tr.insertText(replacement, from, to)
      this.view.dispatch(tr)
    }
    return { total: 0, current: 0 }
  }

  replaceAll(_replacement: string): number {
    return 0
  }

  clearSearch(): void {
    // No-op
  }

  // -------------------------------------------------------------------------
  // Canonical state sync
  // -------------------------------------------------------------------------

  /**
   * Dispatch current source content to the canonical Tiptap Editor.
   * This records the change in PM's native history for unified undo/redo.
   */
  private syncToCanonical(markdown: string): void {
    const tiptap = getTiptapEditor()
    if (!tiptap) return

    const { schema } = tiptap.state
    const doc = parseMarkdown(schema, markdown)
    const { tr } = tiptap.state
    tr.replaceWith(0, tr.doc.content.size, doc.content)
    // Record in history so Ctrl+Z works.
    tr.setMeta('addToHistory', true)
    tiptap.view.dispatch(tr)
  }

  /**
   * Pull the canonical Tiptap Editor's current state and update source view.
   * Called after undo/redo on the canonical editor.
   */
  private syncFromCanonical(): void {
    const tiptap = getTiptapEditor()
    if (!tiptap) return

    const md = serializeMarkdown(tiptap.state.doc)
    const currentMd = this.getContent()
    if (md === currentMd) return

    this.suppressUpdate = true
    const schema = this.view.state.schema
    const doc = this.createDoc(schema, md)
    const tr = this.view.state.tr
    tr.replaceWith(0, tr.doc.content.size, doc.content)
    this.view.dispatch(tr)
    this.suppressUpdate = false

    // Notify callbacks so tab store stays in sync.
    for (const cb of this.contentChangeCallbacks) {
      try { cb(md) } catch { /* ignore */ }
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Create a doc node with a single codeBlock containing the markdown text. */
  private createDoc(schema: Schema, markdown: string) {
    const codeBlock = markdown
      ? schema.nodes.codeBlock.create(null, schema.text(markdown))
      : schema.nodes.codeBlock.create()
    return schema.nodes.doc.create(null, codeBlock)
  }

  /** Report cursor line and heading index to EditorManager. */
  private reportCursor(): void {
    const { line } = this.getCursorPosition()
    reportCursorLine(line)

    const text = this.getContent()
    const lines = text.split('\n')
    let headingIdx = -1
    for (let i = 0; i < Math.min(line, lines.length); i++) {
      if (/^#{1,6}\s/.test(lines[i])) {
        headingIdx++
      }
    }
    reportActiveHeadingIndex(headingIdx)
  }

  /** Build a RegExp from search query and options. */
  private buildRegex(query: string, options: SearchOptions): RegExp | null {
    try {
      let pattern: string
      if (options.regex) {
        pattern = query
      } else {
        pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      if (options.wholeWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = options.caseSensitive ? 'g' : 'gi'
      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }

  /** Find all match positions in the document text. */
  private findAllMatches(text: string, regex: RegExp): Array<{ from: number; to: number }> {
    const matches: Array<{ from: number; to: number }> = []
    let match: RegExpExecArray | null
    regex.lastIndex = 0
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) { regex.lastIndex++; continue }
      matches.push({ from: match.index + 1, to: match.index + match[0].length + 1 })
    }
    return matches
  }

  /** Find the 1-based index of the current match (0 if none). */
  private findCurrentIndex(matches: Array<{ from: number; to: number }>): number {
    const { from } = this.view.state.selection
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].from === from) return i + 1
    }
    return 0
  }

  /** Move selection to a match position. */
  private gotoMatch(match: { from: number; to: number }): void {
    const tr = this.view.state.tr.setSelection(
      TextSelection.create(this.view.state.doc, match.from, match.to),
    ).scrollIntoView()
    this.view.dispatch(tr)
  }

  getView(): EditorView {
    return this.view
  }
}
