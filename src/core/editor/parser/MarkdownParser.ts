/**
 * MarkdownParser — Custom markdown-it based parser that produces a ProseMirror
 * document with format-preserving attrs.
 *
 * Pipeline: markdown text → markdown-it.parse() → token stream → PM doc
 *
 * The token stream provides `.markup` fields with original syntax info
 * (e.g. "**" vs "__", "-" vs "*", "```" vs "~~~") which are stored in
 * the corresponding node/mark attrs for lossless round-trip serialization.
 */

import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { Node as PMNode, Schema, Mark } from '@tiptap/pm/model'

// Shared markdown-it instance with GFM-like features.
const md = new MarkdownIt({
  html: true,
  linkify: false,
})
// Enable strikethrough (~~text~~)
md.enable('strikethrough')

/**
 * Parse a markdown string into a ProseMirror document node.
 *
 * @param schema - The ProseMirror schema (from the editor instance)
 * @param text - The markdown source text
 * @returns A ProseMirror document node
 */
export function parseMarkdown(schema: Schema, text: string): PMNode {
  // Handle empty input: return a minimal doc with one empty paragraph.
  // markdown-it produces no tokens for empty/whitespace-only strings, and
  // ProseMirror's doc node requires at least one child block.
  if (!text || text.trim() === '') {
    return schema.node('doc', null, [schema.node('paragraph')])
  }

  // Detect extra blank lines (more than 1 consecutive blank line between blocks).
  // markdown-it treats them identically to single blank lines, but we want to
  // preserve them as empty paragraph nodes for lossless round-trip.
  const { processed, blankLineMap } = preserveExtraBlankLines(text)

  const tokens = md.parse(processed, {})
  const state = new ParseState(schema, blankLineMap)
  state.parseTokens(tokens)
  return state.finish()
}

/**
 * Scans the source text for runs of extra blank lines and replaces them with
 * a placeholder marker that markdown-it will parse as a paragraph. Returns
 * the modified text and a set of paragraph indices that should be rendered
 * as empty paragraphs (no content).
 */
function preserveExtraBlankLines(text: string): {
  processed: string
  blankLineMap: Set<number>
} {
  const lines = text.split('\n')
  const result: string[] = []
  const blankLineMap = new Set<number>()

  // Track how many paragraphs we've inserted so far (approximation).
  // We use a sentinel paragraph text that won't appear in normal content.
  const SENTINEL = '\u200B' // zero-width space as empty paragraph marker

  let consecutiveBlankLines = 0
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track fenced code blocks
    if (!inFence && /^(`{3,}|~{3,})/.test(line)) {
      inFence = true
      consecutiveBlankLines = 0
      result.push(line)
      continue
    }
    if (inFence) {
      if (/^(`{3,}|~{3,})\s*$/.test(line)) {
        inFence = false
      }
      result.push(line)
      consecutiveBlankLines = 0
      continue
    }

    if (line.trim() === '') {
      consecutiveBlankLines++
      if (consecutiveBlankLines > 1) {
        // Extra blank line — insert a sentinel paragraph
        result.push(SENTINEL)
      } else {
        result.push(line)
      }
    } else {
      consecutiveBlankLines = 0
      result.push(line)
    }
  }

  // Now find which paragraphs in the parsed output correspond to sentinel markers.
  // We parse the processed text and mark sentinel paragraphs.
  const processedText = result.join('\n')
  // Pre-scan: find paragraph token indices that are sentinels
  const tempTokens = md.parse(processedText, {})
  let paragraphIndex = 0
  for (let i = 0; i < tempTokens.length; i++) {
    const token = tempTokens[i]
    if (token.type === 'paragraph_open') {
      // Check next inline token content
      const inlineToken = tempTokens[i + 1]
      if (inlineToken && inlineToken.type === 'inline' && inlineToken.content === SENTINEL) {
        blankLineMap.add(paragraphIndex)
      }
      paragraphIndex++
    }
  }

  return { processed: processedText, blankLineMap }
}

// ---------------------------------------------------------------------------
// Internal parse state
// ---------------------------------------------------------------------------

interface StackEntry {
  type: string
  attrs: Record<string, any>
  content: PMNode[]
  marks: readonly Mark[]
}

class ParseState {
  private schema: Schema
  private stack: StackEntry[]
  /** Active marks applied to inline content */
  private marks: readonly Mark[]
  /** Set of paragraph indices that represent preserved extra blank lines */
  private blankLineMap: Set<number>
  /** Counter for paragraph_open tokens */
  private paragraphIndex = 0

  constructor(schema: Schema, blankLineMap?: Set<number>) {
    this.schema = schema
    // Start with a doc node on the stack
    this.stack = [{ type: 'doc', attrs: {}, content: [], marks: [] }]
    this.marks = Mark.none
    this.blankLineMap = blankLineMap ?? new Set()
  }

  // --- Public API ---

  parseTokens(tokens: Token[]): void {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      this.handleToken(token, tokens, i)
    }
  }

  finish(): PMNode {
    // Close any remaining open nodes (shouldn't happen with valid markdown)
    while (this.stack.length > 1) {
      this.closeNode()
    }
    const top = this.stack[0]
    return this.schema.node('doc', top.attrs, top.content)
  }

  // --- Token handlers ---

  private handleToken(token: Token, _tokens: Token[], _index: number): void {
    switch (token.type) {
      // --- Block tokens ---
      case 'heading_open':
        this.openNode('heading', {
          level: parseInt(token.tag.slice(1), 10),
          prefix: token.markup ? token.markup + ' ' : null,
        })
        break

      case 'heading_close':
        this.closeNode()
        break

      case 'paragraph_open': {
        const isSentinel = this.blankLineMap.has(this.paragraphIndex)
        this.paragraphIndex++
        this.openNode('paragraph', { _blank: isSentinel || undefined })
        break
      }

      case 'paragraph_close':
        this.closeNode()
        break

      case 'blockquote_open':
        this.openNode('blockquote', { marker: '> ' })
        break

      case 'blockquote_close':
        this.closeNode()
        break

      case 'bullet_list_open':
        this.openNode('bulletList', {
          marker: token.markup || '-',
        })
        break

      case 'bullet_list_close':
        this.closeNode()
        break

      case 'ordered_list_open':
        this.openNode('orderedList', {
          start: token.attrGet('start') ? parseInt(token.attrGet('start')!, 10) : 1,
          delimiter: token.markup || '.',
        })
        break

      case 'ordered_list_close':
        this.closeNode()
        break

      case 'list_item_open':
        this.openNode('listItem', {})
        break

      case 'list_item_close':
        this.closeNode()
        break

      case 'fence':
        this.addNode('codeBlock', {
          language: token.info || null,
          fence: token.markup || '```',
        }, [this.schema.text(token.content.replace(/\n$/, '') || ' ')])
        break

      case 'code_block':
        // Indented code block (no fence)
        this.addNode('codeBlock', {
          language: null,
          fence: '```',
        }, [this.schema.text(token.content.replace(/\n$/, '') || ' ')])
        break

      case 'hr':
        this.addNode('horizontalRule', {
          syntax: token.markup || '---',
        })
        break

      case 'table_open':
        this.openNode('table', {})
        break

      case 'table_close':
        this.closeNode()
        break

      case 'thead_open':
        // We don't have a thead node; rows go directly into table
        break

      case 'thead_close':
        break

      case 'tbody_open':
        break

      case 'tbody_close':
        break

      case 'tr_open':
        this.openNode('tableRow', {})
        break

      case 'tr_close':
        this.closeNode()
        break

      case 'th_open':
        this.openNode('tableHeader', {})
        // Table cells contain inline content wrapped in a paragraph
        this.openNode('paragraph', {})
        break

      case 'th_close':
        this.closeNode() // paragraph
        this.closeNode() // tableHeader
        break

      case 'td_open':
        this.openNode('tableCell', {})
        this.openNode('paragraph', {})
        break

      case 'td_close':
        this.closeNode() // paragraph
        this.closeNode() // tableCell
        break

      case 'hardbreak':
        this.addNode('hardBreak', {})
        break

      case 'softbreak':
        // Treat as a space or newline depending on schema
        this.addText('\n')
        break

      // --- Inline container ---
      case 'inline':
        // If current node is a sentinel blank-line paragraph, skip its content
        if (this.currentNodeAttr('_blank')) {
          break
        }
        if (token.children) {
          this.parseInline(token.children)
        }
        break

      // --- HTML block ---
      case 'html_block':
        // Store as a paragraph with raw HTML text for now
        this.openNode('paragraph', {})
        this.addText(token.content.replace(/\n$/, ''))
        this.closeNode()
        break

      // Tokens we intentionally skip
      case 'html_inline':
      case '':
        break

      default:
        // Unknown token type — skip silently
        break
    }
  }

  // --- Inline token handling ---

  private parseInline(tokens: Token[]): void {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]

      switch (token.type) {
        case 'text':
          this.addText(token.content)
          break

        case 'softbreak':
          this.addText('\n')
          break

        case 'hardbreak':
          this.addNode('hardBreak', {})
          break

        case 'strong_open':
          this.openMark('bold', { delimiter: token.markup || '**' })
          break

        case 'strong_close':
          this.closeMark('bold')
          break

        case 'em_open':
          this.openMark('italic', { delimiter: token.markup || '*' })
          break

        case 'em_close':
          this.closeMark('italic')
          break

        case 's_open':
          this.openMark('strike', { delimiter: token.markup || '~~' })
          break

        case 's_close':
          this.closeMark('strike')
          break

        case 'code_inline':
          this.addNode('text', {}, undefined, [
            this.schema.marks.code.create({ delimiter: token.markup || '`' }),
            ...this.marks,
          ], token.content)
          break

        case 'link_open': {
          const href = token.attrGet('href') || ''
          const title = token.attrGet('title') || null
          this.openMark('link', { href, title })
          break
        }

        case 'link_close':
          this.closeMark('link')
          break

        case 'image': {
          const src = token.attrGet('src') || ''
          const alt = token.attrGet('alt') || token.content || ''
          const title = token.attrGet('title') || null
          this.addNode('image', { src, alt, title })
          break
        }

        case 'html_inline':
          // Inline HTML — add as plain text
          this.addText(token.content)
          break

        default:
          // Unknown inline token — add content as text if present
          if (token.content) {
            this.addText(token.content)
          }
          break
      }
    }
  }

  // --- Stack operations ---

  /** Check if the current top-of-stack node has a given attribute set. */
  private currentNodeAttr(key: string): any {
    const top = this.stack[this.stack.length - 1]
    return top?.attrs[key]
  }

  private openNode(type: string, attrs: Record<string, any>): void {
    this.stack.push({ type, attrs, content: [], marks: this.marks })
  }

  private closeNode(): PMNode | null {
    if (this.stack.length <= 1) return null
    const entry = this.stack.pop()!
    const nodeType = this.schema.nodes[entry.type]
    if (!nodeType) return null

    let node: PMNode
    try {
      node = nodeType.createAndFill(entry.attrs, entry.content) as PMNode
    } catch {
      // If createAndFill fails, try with empty content
      try {
        node = nodeType.createAndFill(entry.attrs) as PMNode
      } catch {
        return null
      }
    }

    if (!node) return null

    // Add node to parent
    const parent = this.stack[this.stack.length - 1]
    parent.content.push(node)
    return node
  }

  private addNode(
    type: string,
    attrs: Record<string, any>,
    content?: PMNode[],
    marks?: readonly Mark[],
    textContent?: string,
  ): void {
    // Special case: text node with marks (for code_inline)
    if (type === 'text' && textContent !== undefined) {
      const textNode = this.schema.text(textContent, marks)
      const parent = this.stack[this.stack.length - 1]
      parent.content.push(textNode)
      return
    }

    const nodeType = this.schema.nodes[type]
    if (!nodeType) return

    let node: PMNode | null
    try {
      node = nodeType.createAndFill(attrs, content)
    } catch {
      node = nodeType.createAndFill(attrs)
    }

    if (node) {
      const parent = this.stack[this.stack.length - 1]
      parent.content.push(node)
    }
  }

  private addText(text: string): void {
    if (!text) return
    const parent = this.stack[this.stack.length - 1]
    const textNode = this.schema.text(text, this.marks)
    // Merge with previous text node if marks are the same
    const last = parent.content[parent.content.length - 1]
    if (last && last.isText && last.text && Mark.sameSet(last.marks, this.marks)) {
      parent.content[parent.content.length - 1] = this.schema.text(
        last.text + text,
        this.marks,
      )
    } else {
      parent.content.push(textNode)
    }
  }

  // --- Mark operations ---

  private openMark(type: string, attrs: Record<string, any>): void {
    const markType = this.schema.marks[type]
    if (!markType) return
    const mark = markType.create(attrs)
    this.marks = mark.addToSet(this.marks)
  }

  private closeMark(type: string): void {
    const markType = this.schema.marks[type]
    if (!markType) return
    this.marks = markType.removeFromSet(this.marks)
  }
}
