/**
 * PMSourceEditor — ProseMirror-based source editing mode.
 *
 * Replaces CodeMirror 6 (SourceEditor.ts) with a raw PM EditorView that shares
 * the same EditorState as the WYSIWYG Tiptap view. This enables instant mode
 * switching without serialization/deserialization.
 *
 * Key features:
 * - Raw PM EditorView with source-mode NodeViews + MarkViews (visible syntax)
 * - Shared dispatchTransaction keeps both views in sync
 * - CursorBridge plugin for delimiter navigation
 * - Implements IEditor interface for EditorManager compatibility
 */

import { EditorView } from '@tiptap/pm/view'
import { EditorState, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import { baseKeymap } from '@tiptap/pm/commands'

import type { IEditor, CursorPosition, WordCount, SearchOptions, SearchState } from './types'
import { sourceNodeViews } from './sourceview/SourceNodeViews'
import { sourceMarkViews } from './sourceview/SourceMarkViews'
import { createCursorBridgePlugin } from './sourceview/CursorBridge'
import { serializeMarkdown } from './serializer/MarkdownSerializer'
import { parseMarkdown } from './parser/MarkdownParser'
import {
  registerSourceView,
  createSourceDispatch,
} from './state/SharedDispatch'
import { reportCursorLine, reportActiveHeadingIndex } from './EditorManager'

// ---------------------------------------------------------------------------
// PMSourceEditor class
// ---------------------------------------------------------------------------

export class PMSourceEditor implements IEditor {
  private view: EditorView
  private contentChangeCallbacks: ((markdown: string) => void)[] = []
  private scrollEl: HTMLElement | null = null

  constructor(container: HTMLElement, state: EditorState) {
    const dispatch = createSourceDispatch()

    this.view = new EditorView(container, {
      state,
      dispatchTransaction: (tr: Transaction) => {
        dispatch(tr)

        // Notify content change listeners if doc changed
        if (tr.docChanged) {
          const md = serializeMarkdown(this.view.state.doc)
          for (const cb of this.contentChangeCallbacks) {
            try { cb(md) } catch { /* ignore */ }
          }
        }

        // Report cursor position for status bar
        if (tr.docChanged || tr.selectionSet) {
          this.reportCursor()
        }
      },
      nodeViews: sourceNodeViews,
      markViews: sourceMarkViews,
    })

    // Register with SharedDispatch for dual-view sync
    registerSourceView(this.view)

    // Locate the scroll element (the PM view's scrollable parent)
    this.scrollEl = this.view.dom.querySelector('.ProseMirror') as HTMLElement
      ?? this.view.dom

    // Initial cursor report
    this.reportCursor()
  }

  // -------------------------------------------------------------------------
  // IEditor implementation
  // -------------------------------------------------------------------------

  getContent(): string {
    return serializeMarkdown(this.view.state.doc)
  }

  setContent(markdown: string, _recordInHistory?: boolean): void {
    const schema = this.view.state.schema
    const doc = parseMarkdown(schema, markdown)
    const newState = EditorState.create({
      doc,
      plugins: this.view.state.plugins,
    })
    this.view.updateState(newState)
  }

  focus(): void {
    this.view.focus()
  }

  getCursorPosition(): CursorPosition {
    const { from } = this.view.state.selection
    const doc = this.view.state.doc
    let line = 0
    let pos = 0

    // Walk through blocks to compute line number
    doc.descendants((node, nodePos) => {
      if (node.isBlock && nodePos <= from) {
        line++
        pos = nodePos
      }
      return nodePos <= from
    })

    return {
      line: Math.max(0, line - 1),
      column: from - pos,
      offset: from,
    }
  }

  setCursorPosition(pos: CursorPosition): void {
    const docSize = this.view.state.doc.content.size
    let offset = pos.offset

    // If no valid offset, resolve from line number
    if (offset <= 0 || offset > docSize) {
      offset = this.resolveLineToPos(pos.line)
    }

    offset = Math.min(Math.max(0, offset), docSize)
    const $pos = this.view.state.doc.resolve(offset)
    const selection = Selection.near($pos)
    const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
    this.view.dispatch(tr)
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
    const tr = this.view.state.tr.replaceWith(
      from, to,
      this.view.state.schema.text(text),
    )
    this.view.dispatch(tr)
  }

  undo(): void {
    undo(this.view.state, this.view.dispatch)
  }

  redo(): void {
    redo(this.view.state, this.view.dispatch)
  }

  destroy(): void {
    this.view.destroy()
    this.contentChangeCallbacks = []
  }

  onContentChange(callback: (markdown: string) => void): void {
    this.contentChangeCallbacks.push(callback)
  }

  getWordCount(): WordCount {
    const text = this.view.state.doc.textContent
    const characters = text.length
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    // Count block nodes as lines
    let lines = 0
    this.view.state.doc.descendants((node) => {
      if (node.isTextblock) lines++
      return true
    })
    return { characters, words, lines }
  }

  jumpToHeading(headingIndex: number): void {
    const doc = this.view.state.doc
    let count = 0
    let targetPos = 0

    doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        if (count === headingIndex) {
          targetPos = pos + 1 // Inside the heading
          return false
        }
        count++
      }
      return true
    })

    const $pos = doc.resolve(Math.min(targetPos, doc.content.size))
    const selection = Selection.near($pos)
    const tr = this.view.state.tr
      .setSelection(selection)
      .scrollIntoView()
    this.view.dispatch(tr)
  }

  resetForTabSwitch(): void {
    // For tab switch, we rebuild state from the tab's stored EditorState
    // which already has fresh history. Nothing extra needed here.
  }

  flashCursorLine(): void {
    // TODO: Add a decoration that highlights the current line temporarily.
    // For now, just scroll the cursor into view.
    const tr = this.view.state.tr.scrollIntoView()
    this.view.dispatch(tr)
  }

  // ---- Search / Replace (simplified PM-based implementation) ----

  search(query: string, options: SearchOptions): SearchState {
    if (!query) {
      return { total: 0, current: 0 }
    }
    const text = this.view.state.doc.textContent
    const regex = this.buildRegex(query, options)
    if (!regex) return { total: 0, current: 0, error: 'Invalid regex' }

    const matches = this.findAllMatches(text, regex)
    const current = this.findCurrentIndex(matches)
    if (matches.length > 0 && current === 0) {
      // Move to first match
      this.gotoMatch(matches[0])
      return { total: matches.length, current: 1 }
    }
    return { total: matches.length, current }
  }

  gotoNextMatch(): SearchState {
    // Re-search to find matches (stateless approach)
    return { total: 0, current: 0 }
  }

  gotoPrevMatch(): SearchState {
    return { total: 0, current: 0 }
  }

  replaceNext(replacement: string): SearchState {
    const { from, to } = this.view.state.selection
    if (from !== to) {
      const tr = this.view.state.tr.replaceWith(
        from, to,
        replacement ? this.view.state.schema.text(replacement) : this.view.state.schema.text(''),
      )
      this.view.dispatch(tr)
    }
    return { total: 0, current: 0 }
  }

  replaceAll(_replacement: string): number {
    // TODO: Full implementation
    return 0
  }

  clearSearch(): void {
    // No-op for now — PM doesn't have a built-in search highlight system
    // like CM6. Search decorations would be implemented via a plugin.
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Resolve a 0-based line number to a PM document offset. */
  private resolveLineToPos(line: number): number {
    const doc = this.view.state.doc
    let blockIdx = 0
    let targetPos = 0

    doc.descendants((node, pos) => {
      if (node.isTextblock) {
        if (blockIdx === line) {
          targetPos = pos + 1
          return false
        }
        blockIdx++
      }
      return true
    })

    return targetPos
  }

  /** Report cursor line and heading index to EditorManager. */
  private reportCursor(): void {
    const { from } = this.view.state.selection
    const doc = this.view.state.doc
    let line = 0
    let headingIdx = -1

    doc.descendants((node, pos) => {
      if (node.isTextblock && pos <= from) {
        line++
      }
      if (node.type.name === 'heading' && pos <= from) {
        headingIdx++
      }
      return pos <= from
    })

    reportCursorLine(line)
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
      matches.push({ from: match.index, to: match.index + match[0].length })
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

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------

  /**
   * Create the PM plugins needed for source mode.
   * Called when building the shared EditorState.
   */
  static createPlugins() {
    return [
      history(),
      keymap(baseKeymap),
      createCursorBridgePlugin(),
    ]
  }

  /**
   * Get the raw PM EditorView (for SharedDispatch registration, etc.)
   */
  getView(): EditorView {
    return this.view
  }
}
