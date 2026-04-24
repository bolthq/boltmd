import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history, indentWithTab, undo, redo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll, getSearchQuery } from '@codemirror/search'
import { indentOnInput, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { eventBus } from '../events/EventBus'
import { AppEvent } from '../events/events'
import { themeService } from '../services/ThemeService'
import type { IEditor, CursorPosition, WordCount, SearchOptions, SearchState } from './types'

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

  // ---- 查找 / 替换 ----

  /** 编译当前查询的正则（供遍历计数 / 当前索引计算用） */
  private compileRegex(query: SearchQuery): RegExp | null {
    if (!query.search) return null
    try {
      let pattern: string
      if (query.regexp) {
        pattern = query.search
      } else {
        pattern = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }
      if (query.wholeWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = query.caseSensitive ? 'g' : 'gi'
      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }

  /** 遍历整个文档数匹配总数 + 当前光标所在匹配索引（1-based；0 = 无/未命中） */
  private computeSearchState(query: SearchQuery | null): SearchState {
    if (!query || !query.search) return { total: 0, current: 0 }

    const regex = this.compileRegex(query)
    if (!regex) {
      return { total: 0, current: 0, error: 'Invalid regex' }
    }

    const text = this.view.state.doc.toString()
    const cursorPos = this.view.state.selection.main.from
    let total = 0
    let current = 0
    let match: RegExpExecArray | null
    regex.lastIndex = 0
    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++
        continue
      }
      total++
      // 选区起点 == 匹配起点，视为"当前"
      if (current === 0 && match.index === cursorPos) {
        current = total
      }
    }
    return { total, current }
  }

  private buildQuery(query: string, options: SearchOptions): SearchQuery {
    return new SearchQuery({
      search: query,
      caseSensitive: options.caseSensitive,
      wholeWord: options.wholeWord,
      regexp: options.regex,
    })
  }

  search(query: string, options: SearchOptions): SearchState {
    if (!query) {
      this.clearSearch()
      return { total: 0, current: 0 }
    }

    const sq = this.buildQuery(query, options)

    // 正则语法错误预检
    if (options.regex) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(query)
      } catch (e) {
        this.view.dispatch({ effects: setSearchQuery.of(sq) })
        return {
          total: 0,
          current: 0,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }

    this.view.dispatch({ effects: setSearchQuery.of(sq) })
    // 跳到第一个匹配
    findNext(this.view)
    return this.computeSearchState(sq)
  }

  gotoNextMatch(): SearchState {
    const query = getSearchQuery(this.view.state)
    if (!query || !query.search) return { total: 0, current: 0 }
    findNext(this.view)
    return this.computeSearchState(query)
  }

  gotoPrevMatch(): SearchState {
    const query = getSearchQuery(this.view.state)
    if (!query || !query.search) return { total: 0, current: 0 }
    findPrevious(this.view)
    return this.computeSearchState(query)
  }

  replaceNext(replacement: string): SearchState {
    const query = getSearchQuery(this.view.state)
    if (!query || !query.search) return { total: 0, current: 0 }
    // CM6 的 replaceNext 使用 query.replace，所以先同步新的 replace 字符串
    const newQuery = new SearchQuery({
      search: query.search,
      replace: replacement,
      caseSensitive: query.caseSensitive,
      wholeWord: query.wholeWord,
      regexp: query.regexp,
    })
    this.view.dispatch({ effects: setSearchQuery.of(newQuery) })
    replaceNext(this.view)
    return this.computeSearchState(newQuery)
  }

  replaceAll(replacement: string): number {
    const query = getSearchQuery(this.view.state)
    if (!query || !query.search) return 0
    const before = this.computeSearchState(query).total
    if (before === 0) return 0

    const newQuery = new SearchQuery({
      search: query.search,
      replace: replacement,
      caseSensitive: query.caseSensitive,
      wholeWord: query.wholeWord,
      regexp: query.regexp,
    })
    this.view.dispatch({ effects: setSearchQuery.of(newQuery) })
    replaceAll(this.view)
    return before
  }

  clearSearch(): void {
    // 用空查询覆盖掉旧的查询 → 匹配高亮消失
    this.view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: '' })),
    })
  }
}
