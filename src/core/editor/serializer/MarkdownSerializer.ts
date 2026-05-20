/**
 * MarkdownSerializer — Converts a ProseMirror document tree back to markdown
 * text using format-preserving attrs for lossless round-trip.
 *
 * Pipeline: PM doc → recursive tree walk → markdown text
 *
 * Each node/mark reads its format attrs (prefix, delimiter, marker, fence, etc.)
 * to reconstruct the exact original markdown syntax.
 */

import { Node as PMNode, Mark } from '@tiptap/pm/model'
import { defaultHeadingPrefix } from '../extensions/FormatAttrs'

/**
 * Serialize a ProseMirror document node to markdown text.
 */
export function serializeMarkdown(doc: PMNode): string {
  const state = new SerializeState()
  serializeFragment(doc, state)
  return state.getOutput()
}

// ---------------------------------------------------------------------------
// Serialization state
// ---------------------------------------------------------------------------

class SerializeState {
  private output = ''
  /** Track whether we need a blank line before the next block */
  private atBlockStart = true

  write(text: string): void {
    this.output += text
  }

  /** Ensure a blank line separator between blocks */
  ensureBlankLine(): void {
    if (this.atBlockStart) return
    // Ensure output ends with \n\n
    if (!this.output.endsWith('\n\n')) {
      if (this.output.endsWith('\n')) {
        this.output += '\n'
      } else {
        this.output += '\n\n'
      }
    }
  }

  markBlockWritten(): void {
    this.atBlockStart = false
  }

  getOutput(): string {
    // Trim trailing whitespace but ensure single trailing newline
    let result = this.output.replace(/\n+$/, '')
    if (result.length > 0) {
      result += '\n'
    }
    return result
  }
}

// ---------------------------------------------------------------------------
// Fragment (doc-level) serialization
// ---------------------------------------------------------------------------

function serializeFragment(doc: PMNode, state: SerializeState): void {
  doc.forEach((node) => {
    serializeNode(node, state)
  })
}

// ---------------------------------------------------------------------------
// Node serialization
// ---------------------------------------------------------------------------

function serializeNode(node: PMNode, state: SerializeState): void {
  switch (node.type.name) {
    case 'paragraph':
      serializeParagraph(node, state)
      break
    case 'heading':
      serializeHeading(node, state)
      break
    case 'bulletList':
      serializeBulletList(node, state)
      break
    case 'orderedList':
      serializeOrderedList(node, state)
      break
    case 'listItem':
      // Should not be reached directly; handled by list serializers
      break
    case 'blockquote':
      serializeBlockquote(node, state)
      break
    case 'codeBlock':
      serializeCodeBlock(node, state)
      break
    case 'horizontalRule':
      serializeHorizontalRule(node, state)
      break
    case 'table':
      serializeTable(node, state)
      break
    case 'hardBreak':
      state.write('\\\n')
      break
    case 'image':
      serializeImage(node, state)
      break
    default:
      // Fallback: serialize children if any
      if (node.isBlock) {
        state.ensureBlankLine()
        state.write(serializeInlineContent(node))
        state.write('\n')
        state.markBlockWritten()
      }
      break
  }
}

// --- Block serializers ---

function serializeParagraph(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  state.write(serializeInlineContent(node))
  state.write('\n')
  state.markBlockWritten()
}

function serializeHeading(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const prefix = node.attrs.prefix || defaultHeadingPrefix(node.attrs.level || 1)
  state.write(prefix + serializeInlineContent(node))
  state.write('\n')
  state.markBlockWritten()
}

function serializeBulletList(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const marker = node.attrs.marker || '-'
  node.forEach((listItem) => {
    serializeListItem(listItem, marker + ' ', '  ', state)
  })
  state.markBlockWritten()
}

function serializeOrderedList(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const delimiter = node.attrs.delimiter || '.'
  const start = node.attrs.start || 1
  let index = start
  node.forEach((listItem) => {
    const prefix = `${index}${delimiter} `
    const indent = ' '.repeat(prefix.length)
    serializeListItem(listItem, prefix, indent, state)
    index++
  })
  state.markBlockWritten()
}

function serializeListItem(
  node: PMNode,
  prefix: string,
  indent: string,
  state: SerializeState,
): void {
  let isFirst = true
  node.forEach((child) => {
    if (isFirst) {
      state.write(prefix)
      isFirst = false
    } else {
      // Subsequent blocks in a list item get indentation
      state.write('\n' + indent)
    }
    if (child.type.name === 'paragraph') {
      state.write(serializeInlineContent(child))
      state.write('\n')
    } else if (child.type.name === 'bulletList' || child.type.name === 'orderedList') {
      // Nested list: serialize recursively with indentation
      const nestedState = new SerializeState()
      serializeNode(child, nestedState)
      const nested = nestedState.getOutput().replace(/\n$/, '')
      // Indent all lines of nested content
      const lines = nested.split('\n')
      state.write(lines.join('\n' + indent))
      state.write('\n')
    } else {
      // Other blocks inside list items
      const blockState = new SerializeState()
      serializeNode(child, blockState)
      state.write(blockState.getOutput().replace(/\n$/, ''))
      state.write('\n')
    }
  })
}

function serializeBlockquote(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const marker = node.attrs.marker || '> '
  // Serialize children, then prefix each line with marker
  const innerState = new SerializeState()
  node.forEach((child) => {
    serializeNode(child, innerState)
  })
  const inner = innerState.getOutput().replace(/\n$/, '')
  const lines = inner.split('\n')
  for (let i = 0; i < lines.length; i++) {
    // Empty lines in blockquotes get just ">"
    if (lines[i] === '' && i > 0) {
      state.write('>')
    } else {
      state.write(marker + lines[i])
    }
    state.write('\n')
  }
  state.markBlockWritten()
}

function serializeCodeBlock(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const fence = node.attrs.fence || '```'
  const lang = node.attrs.language || ''
  state.write(fence + lang + '\n')
  state.write(node.textContent)
  state.write('\n' + fence + '\n')
  state.markBlockWritten()
}

function serializeHorizontalRule(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const syntax = node.attrs.syntax || '---'
  state.write(syntax + '\n')
  state.markBlockWritten()
}

function serializeImage(node: PMNode, state: SerializeState): void {
  const alt = node.attrs.alt || ''
  const src = node.attrs.src || ''
  const title = node.attrs.title
  if (title) {
    state.write(`![${alt}](${src} "${title}")`)
  } else {
    state.write(`![${alt}](${src})`)
  }
}

// --- Table serialization ---

function serializeTable(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  const rows: string[][] = []
  const colWidths: number[] = []

  // Collect all cell contents
  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => {
      // Cell content: serialize inline content of the first paragraph
      let content = ''
      if (cell.childCount > 0) {
        const firstChild = cell.firstChild
        if (firstChild) {
          content = serializeInlineContent(firstChild)
        }
      }
      cells.push(content)
    })
    rows.push(cells)
  })

  // Calculate column widths
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const width = row[i].length
      if (!colWidths[i] || width > colWidths[i]) {
        colWidths[i] = Math.max(width, 3)
      }
    }
  }

  // Output header row
  if (rows.length > 0) {
    state.write(formatTableRow(rows[0], colWidths))
    state.write('\n')
    // Separator row
    const separator = colWidths.map((w) => '-'.repeat(w)).join(' | ')
    state.write('| ' + separator + ' |')
    state.write('\n')
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      state.write(formatTableRow(rows[i], colWidths))
      state.write('\n')
    }
  }
  state.markBlockWritten()
}

function formatTableRow(cells: string[], colWidths: number[]): string {
  const padded = cells.map((cell, i) => {
    const width = colWidths[i] || 3
    return cell.padEnd(width)
  })
  return '| ' + padded.join(' | ') + ' |'
}

// ---------------------------------------------------------------------------
// Inline content serialization
// ---------------------------------------------------------------------------

/**
 * Serialize the inline content of a node (paragraph, heading, etc.)
 * into a markdown string. Tracks mark open/close boundaries.
 */
function serializeInlineContent(node: PMNode): string {
  let result = ''
  let activeMarks: readonly Mark[] = Mark.none

  node.forEach((child) => {
    const newMarks = child.marks

    // Close marks no longer present (reverse order for proper nesting)
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      if (!activeMarks[i].isInSet(newMarks)) {
        result += getClosingDelimiter(activeMarks[i])
      }
    }

    // Open marks newly appearing
    for (const mark of newMarks) {
      if (!mark.isInSet(activeMarks)) {
        result += getOpeningDelimiter(mark)
      }
    }

    activeMarks = newMarks

    // Output node content
    if (child.isText) {
      result += child.text || ''
    } else if (child.type.name === 'hardBreak') {
      result += '\\\n'
    } else if (child.type.name === 'image') {
      const alt = child.attrs.alt || ''
      const src = child.attrs.src || ''
      const title = child.attrs.title
      if (title) {
        result += `![${alt}](${src} "${title}")`
      } else {
        result += `![${alt}](${src})`
      }
    }
  })

  // Close remaining open marks
  for (let i = activeMarks.length - 1; i >= 0; i--) {
    result += getClosingDelimiter(activeMarks[i])
  }

  return result
}

// ---------------------------------------------------------------------------
// Mark delimiter helpers
// ---------------------------------------------------------------------------

function getOpeningDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return mark.attrs.delimiter || '**'
    case 'italic':
      return mark.attrs.delimiter || '*'
    case 'strike':
      return mark.attrs.delimiter || '~~'
    case 'code':
      return mark.attrs.delimiter || '`'
    case 'link': {
      return '['
    }
    default:
      return ''
  }
}

function getClosingDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return mark.attrs.delimiter || '**'
    case 'italic':
      return mark.attrs.delimiter || '*'
    case 'strike':
      return mark.attrs.delimiter || '~~'
    case 'code':
      return mark.attrs.delimiter || '`'
    case 'link': {
      const href = mark.attrs.href || ''
      const title = mark.attrs.title
      if (title) {
        return `](${href} "${title}")`
      }
      return `](${href})`
    }
    default:
      return ''
  }
}
