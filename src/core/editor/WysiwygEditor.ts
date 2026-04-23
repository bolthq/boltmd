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
import type { IEditor, CursorPosition, WordCount } from './types'
import { t } from '../../i18n'

// 懒初始化 lowlight，避免模块加载时同步解析所有语言语法
let _lowlight: any = null
async function getLowlight() {
  if (!_lowlight) {
    const { common, createLowlight } = await import('lowlight')
    _lowlight = createLowlight(common)
  }
  return _lowlight
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
      transformCopiedText: true,
      transformPastedText: true,
    }),
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
    const docSize = this.editor.state.doc.content.size
    const offset = Math.min(pos.offset, docSize)
    this.editor.commands.setTextSelection(offset)
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
}
