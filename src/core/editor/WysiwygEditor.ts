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
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import type { Editor } from '@tiptap/core'
import type { IEditor, CursorPosition, WordCount } from './types'

const lowlight = createLowlight(common)

// 返回编辑器扩展列表，供 useEditor() 使用
export function createWysiwygExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
    }),
    Placeholder.configure({
      placeholder: '开始写作...',
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    CodeBlockLowlight.configure({ lowlight }),
    Highlight.configure({ multicolor: true }),
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

  constructor(editor: Editor) {
    this.editor = editor
    this.editor.on('update', () => {
      const md = this.editor.storage.markdown.getMarkdown()
      this.contentChangeCallbacks.forEach(cb => cb(md))
    })
  }

  getContent(): string {
    return this.editor.storage.markdown.getMarkdown()
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
