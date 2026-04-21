import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history, indentWithTab, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { eventBus } from '../events/EventBus'
import { AppEvent } from '../events/events'
import { themeService } from '../services/ThemeService'
import type { IEditor, CursorPosition, WordCount } from './types'

/** 暗色语法高亮样式 */
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c678dd' },
  { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: '#e06c75' },
  { tag: [tags.propertyName], color: '#e06c75' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: '#61afef' },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: '#d19a66' },
  { tag: [tags.definition(tags.name), tags.separator], color: '#abb2bf' },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: '#e5c07b' },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: '#56b6c2' },
  { tag: [tags.meta, tags.comment], color: '#7f848e' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#61afef', textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: '#e06c75' },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: '#d19a66' },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: '#98c379' },
  { tag: tags.invalid, color: '#ffffff', backgroundColor: '#e06c75' },
])

// 源码编辑器（CodeMirror 6）实现 IEditor 接口
export class SourceEditor implements IEditor {
  private view: EditorView
  private contentChangeCallbacks: ((markdown: string) => void)[] = []
  private highlightCompartment = new Compartment()
  private themeHandler: ((...args: unknown[]) => void) | null = null

  constructor(container: HTMLElement, initialContent = '') {

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = this.view.state.doc.toString()
        this.contentChangeCallbacks.forEach(cb => cb(content))
      }
    })

    const isDark = themeService.getResolvedTheme() === 'dark'

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      history(),
      foldGutter(),
      indentOnInput(),
      this.highlightCompartment.of(
        syntaxHighlighting(isDark ? darkHighlightStyle : defaultHighlightStyle, { fallback: true })
      ),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      EditorView.lineWrapping,
      updateListener,
      SourceEditor.theme(),
    ]

    this.view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions,
      }),
      parent: container,
    })

    // 监听主题切换，reconfigure 语法高亮
    this.themeHandler = (...args: unknown[]) => {
      const resolved = args[0] as 'light' | 'dark'
      const style = resolved === 'dark' ? darkHighlightStyle : defaultHighlightStyle
      this.view.dispatch({
        effects: this.highlightCompartment.reconfigure(
          syntaxHighlighting(style, { fallback: true })
        ),
      })
    }
    eventBus.on(AppEvent.ThemeChange, this.themeHandler)
  }

  // 基础 CM6 主题变量桥接（颜色走 CSS 变量，在 source.css 里定义）
  private static theme() {
    return EditorView.theme({
      '&': {
        flex: '1',
        minHeight: '0',
        fontSize: 'var(--font-size-editor)',
        fontFamily: 'var(--font-mono)',
        backgroundColor: 'var(--bg-editor)',
        color: 'var(--text-primary)',
      },
      '.cm-content': {
        padding: '48px 64px',
        caretColor: 'var(--accent-primary)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 'var(--line-height-editor)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-muted)',
        border: 'none',
        borderRight: '1px solid var(--border-primary)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--bg-hover)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--bg-hover)',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--selection-bg)',
      },
      '.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--selection-bg)',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--accent-primary)',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-muted)',
        border: 'none',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        overflow: 'auto',
      },
    })
  }

  getContent(): string {
    return this.view.state.doc.toString()
  }

  setContent(markdown: string): void {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: markdown,
      },
    })
  }

  focus(): void {
    this.view.focus()
  }

  getCursorPosition(): CursorPosition {
    const pos = this.view.state.selection.main.head
    const line = this.view.state.doc.lineAt(pos)
    return {
      line: line.number - 1,
      column: pos - line.from,
      offset: pos,
    }
  }

  setCursorPosition(pos: CursorPosition): void {
    const docSize = this.view.state.doc.length
    const offset = Math.min(pos.offset, docSize)
    this.view.dispatch({
      selection: { anchor: offset },
      scrollIntoView: true,
    })
  }

  getScrollPosition(): number {
    return this.view.scrollDOM.scrollTop
  }

  setScrollPosition(pos: number): void {
    this.view.scrollDOM.scrollTop = pos
  }

  getSelection(): string {
    const { from, to } = this.view.state.selection.main
    return this.view.state.doc.sliceString(from, to)
  }

  insertText(text: string): void {
    this.view.dispatch(
      this.view.state.replaceSelection(text)
    )
  }

  undo(): void {
    undo(this.view)
  }

  redo(): void {
    redo(this.view)
  }

  destroy(): void {
    if (this.themeHandler) {
      eventBus.off(AppEvent.ThemeChange, this.themeHandler)
      this.themeHandler = null
    }
    this.view.destroy()
  }

  onContentChange(callback: (markdown: string) => void): void {
    this.contentChangeCallbacks.push(callback)
  }

  getWordCount(): WordCount {
    const text = this.view.state.doc.toString()
    const characters = text.length
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
    const lines = this.view.state.doc.lines
    return { characters, words, lines }
  }
}
