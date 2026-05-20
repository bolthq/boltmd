/**
 * Round-trip tests for MarkdownParser + MarkdownSerializer.
 *
 * Verifies that: markdown → parse → serialize → identical markdown
 * for various CommonMark + GFM constructs with format-preserving attrs.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import CodeBlock from '@tiptap/extension-code-block'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import type { Schema } from '@tiptap/pm/model'
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
} from '../extensions/FormatAttrs'
import { parseMarkdown } from '../parser/MarkdownParser'
import { serializeMarkdown } from '../serializer/MarkdownSerializer'

// CodeBlock with format-preserving `fence` attr (matches production config)
const FormatCodeBlock = CodeBlock.extend({
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
})

let schema: Schema

beforeAll(() => {
  // Create a Tiptap editor with same schema as production but without
  // Placeholder (which depends on i18n) and without lowlight/Markdown extensions.
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
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
      FormatHeading,
      FormatBold,
      FormatItalic,
      FormatStrike,
      FormatCode,
      FormatCodeBlock,
      FormatBulletList,
      FormatOrderedList,
      FormatBlockquote,
      FormatHorizontalRule,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: true, allowBase64: true }),
    ],
    content: '',
  })
  schema = editor.state.schema
  editor.destroy()
})

/**
 * Helper: parse markdown then serialize back, compare with original.
 */
function roundTrip(markdown: string): string {
  const doc = parseMarkdown(schema, markdown)
  return serializeMarkdown(doc)
}

describe('MarkdownParser + Serializer round-trip', () => {
  describe('headings', () => {
    it('ATX headings with various levels', () => {
      const input = '# Heading 1\n\n## Heading 2\n\n### Heading 3\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('preserves heading prefix style', () => {
      const input = '## Hello World\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('inline marks', () => {
    it('bold with **', () => {
      const input = 'Hello **world**\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('bold with __', () => {
      const input = 'Hello __world__\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('italic with *', () => {
      const input = 'Hello *world*\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('italic with _', () => {
      const input = 'Hello _world_\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('strikethrough', () => {
      const input = 'Hello ~~world~~\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('inline code', () => {
      const input = 'Use `console.log()` here\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('nested bold and italic', () => {
      const input = '**bold *italic* bold**\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('links', () => {
    it('inline link', () => {
      const input = '[Google](https://google.com)\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('link with title', () => {
      const input = '[Google](https://google.com "Search Engine")\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('images', () => {
    it('inline image', () => {
      const input = '![Alt text](image.png)\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('image with title', () => {
      const input = '![Alt](image.png "Title")\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('lists', () => {
    it('bullet list with -', () => {
      const input = '- item 1\n- item 2\n- item 3\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('bullet list with *', () => {
      const input = '* item 1\n* item 2\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('ordered list with .', () => {
      const input = '1. first\n2. second\n3. third\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('ordered list with )', () => {
      const input = '1) first\n2) second\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('blockquote', () => {
    it('simple blockquote', () => {
      const input = '> This is quoted\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('multi-paragraph blockquote', () => {
      const input = '> First paragraph\n>\n> Second paragraph\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('code blocks', () => {
    it('fenced with ```', () => {
      const input = '```js\nconst x = 1\n```\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('fenced with ~~~', () => {
      const input = '~~~python\nprint("hello")\n~~~\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('code block without language', () => {
      const input = '```\nplain code\n```\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('horizontal rule', () => {
    it('with ---', () => {
      const input = '---\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('with ***', () => {
      const input = '***\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('with ___', () => {
      const input = '___\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('paragraphs', () => {
    it('simple paragraph', () => {
      const input = 'Hello world\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('multiple paragraphs', () => {
      const input = 'First paragraph\n\nSecond paragraph\n'
      expect(roundTrip(input)).toBe(input)
    })
  })

  describe('mixed content', () => {
    it('heading + paragraph + list', () => {
      const input = '## Title\n\nSome text here.\n\n- item 1\n- item 2\n'
      expect(roundTrip(input)).toBe(input)
    })

    it('paragraph + code block + paragraph', () => {
      const input = 'Before code\n\n```ts\nconst x = 1\n```\n\nAfter code\n'
      expect(roundTrip(input)).toBe(input)
    })
  })
})
