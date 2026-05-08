import type { Extensions } from '@tiptap/core'
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
import type { IEditor, CursorPosition, WordCount, SearchOptions, SearchState } from './types'
import { t } from '../../i18n'
import { SearchAndReplace, searchPluginKey } from './extensions/SearchAndReplace'
import { HeadingHighlight } from './extensions/HeadingHighlight'

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
      codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: () => t('editor.placeholder'),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    // CodeBlockLowlight 会在 lowlight 预热完成后正常工作；
    // 若预热未完成（极端情况），高亮会延迟但不阻塞输入
    CodeBlockLowlight.configure({
      lowlight: {
        // 代理对象：同步返回，内部转发到懒加载的实例
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

  constructor(editor: Editor) {
    this.editor = editor
    // 防抖 getMarkdown()：避免每次按键都遍历整棵 AST
    this.editor.on('update', () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        const md = (this.editor.storage as any).markdown.getMarkdown()
        this.contentChangeCallbacks.forEach(cb => cb(md))
      }, 150)
    })
  }

  getContent(): string {
    return (this.editor.storage as any).markdown.getMarkdown()
  }

  setContent(markdown: string): void {
    this.editor.commands.setContent(markdown)
  }

  focus(): void {
    this.editor.commands.focus()
  }

  getCursorPosition(): CursorPosition {
    const { from } = this.editor.state.selection
    const resolved = this.editor.state.doc.resolve(from)
    return {
      line: resolved.depth > 0 ? resolved.index(0) : 0,
      column: resolved.parentOffset,
      offset: from,
    }
  }

  setCursorPosition(pos: CursorPosition): void {
    const doc = this.editor.state.doc
    const docSize = doc.content.size
    let offset = pos.offset
    let headingNodePos = -1 // Track the heading node's start position for DOM lookup.

    if (offset > 0) {
      // Find the heading node at position corresponding to source line.
      let headingCount = 0
      let targetPos = -1
      // Count how many headings precede this line in the source to get heading index.
      const sourceLines = (this.editor.storage as any).markdown?.getMarkdown()?.split('\n') ?? []
      let headingIndex = 0
      for (let i = 0; i < pos.line && i < sourceLines.length; i++) {
        if (/^#{1,6}\s+/.test(sourceLines[i])) {
          headingIndex++
        }
      }
      // Now find the Nth heading node in the ProseMirror document.
      doc.descendants((node, nodePos) => {
        if (targetPos >= 0) return false
        if (node.type.name === 'heading') {
          if (headingCount === headingIndex) {
            targetPos = nodePos + 1 // +1 to enter the node content
            headingNodePos = nodePos
            return false
          }
          headingCount++
        }
        return true
      })
      if (targetPos >= 0) {
        offset = Math.min(targetPos, docSize)
      } else {
        // Fallback: use block index approach.
        const blockIndex = Math.min(pos.line, doc.childCount - 1)
        let blockOffset = 0
        for (let i = 0; i < blockIndex; i++) {
          blockOffset += doc.child(i).nodeSize
        }
        offset = Math.min(blockOffset + 1, docSize)
      }
    } else if (pos.line > 0) {
      // No offset provided, resolve from block index as fallback.
      const blockIndex = Math.min(pos.line, doc.childCount - 1)
      let blockOffset = 0
      for (let i = 0; i < blockIndex; i++) {
        blockOffset += doc.child(i).nodeSize
      }
      offset = Math.min(blockOffset + 1, docSize)
    }

    offset = Math.min(offset, docSize)
    this.editor.commands.setTextSelection(offset)
    // Scroll the target to the vertical center instantly.
    // Use scrollIntoView first to ensure the DOM node is rendered,
    // then immediately adjust to center position.
    this.editor.commands.scrollIntoView()
    // Use setTimeout(0) to let ProseMirror finish its scroll, then override to center.
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
        // Visual highlight flash via Decoration (framework-managed).
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
}
