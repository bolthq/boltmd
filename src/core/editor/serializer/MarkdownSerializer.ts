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

/**
 * Given a PM document and a PM offset (cursor position), return the
 * corresponding character offset in the serialized markdown text.
 * Returns -1 if the mapping cannot be computed.
 */
export function pmOffsetToTextOffset(doc: PMNode, pmOffset: number): number {
  // Build a map of each block's text range in the full serialized output.
  const blockRanges = computeBlockRanges(doc)
  const md = serializeMarkdown(doc)

  let pmPos = 0

  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const nodeStart = pmPos + 1 // +1 to enter the node
    const nodeEnd = pmPos + node.nodeSize

    if (pmOffset < nodeEnd) {
      // Cursor is inside this block.
      const blockMd = serializeBlock(node)
      const intraOffset = mapIntraBlock(node, pmOffset - nodeStart, blockMd)
      return blockRanges[i].start + intraOffset
    }

    pmPos += node.nodeSize
  }

  // Fallback: end of document
  return Math.min(pmPos, md.length)
}

/**
 * Given a PM document and a character offset in serialized markdown,
 * return the corresponding PM offset. Returns 1 if mapping fails.
 */
export function textOffsetToPmOffset(doc: PMNode, textOffset: number): number {
  // Build a map of each block's text range in the full serialized output.
  const blockRanges = computeBlockRanges(doc)

  let pmPos = 0

  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i)
    const range = blockRanges[i]

    if (textOffset < range.end) {
      // Cursor is inside (or at the start of) this block.
      if (textOffset < range.start) {
        // Cursor is in the inter-block separator before this block.
        // Place cursor at end of previous block (or start of doc).
        if (i > 0) {
          return pmPos - 1
        }
        return 1
      }
      const nodeStart = pmPos + 1
      const blockMd = serializeBlock(node)
      const intraTextOffset = textOffset - range.start
      const intraPmOffset = mapTextToIntraBlock(node, intraTextOffset, blockMd)
      return nodeStart + intraPmOffset
    }

    pmPos += node.nodeSize
  }

  return Math.min(pmPos, doc.content.size)
}

/**
 * Compute the text range [start, end) of each top-level block in the full
 * serialized markdown output. This accounts for inter-block separators
 * (ensureBlankLine) precisely, avoiding the fixed +1 assumption.
 */
interface BlockRange { start: number; end: number }

function computeBlockRanges(doc: PMNode): BlockRange[] {
  const ranges: BlockRange[] = []
  const state = new SerializeState()

  for (let i = 0; i < doc.childCount; i++) {
    serializeNode(doc.child(i), state)
    const lengthAfter = state.getRawOutput().length
    // The block's content in the full output occupies the tail portion.
    // ensureBlankLine may add \n separators before the block content.
    // The actual block text (matching serializeBlock output) is the last
    // blockMdLength characters of the current output.
    const blockMd = serializeBlock(doc.child(i))
    const contentEnd = lengthAfter
    const contentStart = contentEnd - blockMd.length
    ranges.push({ start: contentStart, end: contentEnd })
  }

  return ranges
}

// ---------------------------------------------------------------------------
// Per-block serialization helpers for offset mapping
// ---------------------------------------------------------------------------

/** Serialize a single top-level block node to markdown (without inter-block separator). */
function serializeBlock(node: PMNode): string {
  const state = new SerializeState()
  serializeNode(node, state)
  // getOutput trims trailing newlines and adds exactly one.
  // For offset mapping, we want the raw output (with trailing \n from the block).
  return state.getRawOutput()
}

/**
 * Map a PM intra-node offset to a text offset within the block's markdown.
 * `pmIntra` is the offset from the start of the node's content (after the opening token).
 */
function mapIntraBlock(node: PMNode, pmIntra: number, blockMd: string): number {
  const nodeType = node.type.name

  if (nodeType === 'paragraph') {
    // Paragraph: no prefix, inline content maps directly but marks add syntax.
    return mapInlineOffset(node, pmIntra)
  }

  if (nodeType === 'heading') {
    // Heading: prefix (e.g. "## ") + inline content.
    const prefix = node.attrs.prefix || defaultHeadingPrefix(node.attrs.level || 1)
    return prefix.length + mapInlineOffset(node, pmIntra)
  }

  if (nodeType === 'codeBlock') {
    // Code block: "```lang\n" + text + "\n```\n"
    const fence = node.attrs.fence || '```'
    const lang = node.attrs.language || ''
    const prefixLen = fence.length + lang.length + 1 // +1 for \n after fence
    // Inside code block, PM offset = text character offset directly.
    return prefixLen + Math.min(pmIntra, node.textContent.length)
  }

  if (nodeType === 'bulletList' || nodeType === 'orderedList') {
    return mapListOffset(node, pmIntra, nodeType)
  }

  if (nodeType === 'blockquote') {
    return mapBlockquoteOffset(node, pmIntra)
  }

  if (nodeType === 'table') {
    return mapTableOffset(node, pmIntra, blockMd)
  }

  // Fallback: approximate using text content ratio.
  const textLen = node.textContent.length
  if (textLen === 0) return 0
  const ratio = pmIntra / (node.content.size || 1)
  return Math.min(Math.round(ratio * blockMd.length), blockMd.length)
}

/**
 * Reverse map: given a text offset within block markdown, find the PM intra-node offset.
 */
function mapTextToIntraBlock(node: PMNode, textIntra: number, blockMd: string): number {
  const nodeType = node.type.name

  if (nodeType === 'paragraph') {
    return mapTextToInlineOffset(node, textIntra)
  }

  if (nodeType === 'heading') {
    const prefix = node.attrs.prefix || defaultHeadingPrefix(node.attrs.level || 1)
    if (textIntra <= prefix.length) return 0
    return mapTextToInlineOffset(node, textIntra - prefix.length)
  }

  if (nodeType === 'codeBlock') {
    const fence = node.attrs.fence || '```'
    const lang = node.attrs.language || ''
    const prefixLen = fence.length + lang.length + 1
    if (textIntra <= prefixLen) return 0
    const textOffset = textIntra - prefixLen
    return Math.min(textOffset, node.textContent.length)
  }

  if (nodeType === 'bulletList' || nodeType === 'orderedList') {
    return mapTextToListOffset(node, textIntra, nodeType)
  }

  if (nodeType === 'blockquote') {
    return mapTextToBlockquoteOffset(node, textIntra)
  }

  if (nodeType === 'table') {
    return mapTextToTableOffset(node, textIntra, blockMd)
  }

  // Fallback: ratio-based approximation.
  const ratio = textIntra / (blockMd.length || 1)
  return Math.min(Math.round(ratio * (node.content.size || 0)), node.content.size)
}

// ---------------------------------------------------------------------------
// Inline content offset mapping (handles marks like **bold**, _italic_, etc.)
// ---------------------------------------------------------------------------

/**
 * Map a PM offset within an inline-content node to the text offset in its
 * serialized markdown (accounting for mark delimiters).
 */
function mapInlineOffset(node: PMNode, pmOffset: number): number {
  let pmPos = 0
  let textPos = 0
  let activeMarks: readonly Mark[] = Mark.none

  for (let ci = 0; ci < node.childCount; ci++) {
    const child = node.child(ci)
    const newMarks = child.marks

    // Close marks no longer active in the new child.
    // When cursor is at a child boundary (pmPos == pmOffset), closing
    // delimiters from the previous child have already been "passed" in text,
    // so they must be counted.
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      if (!activeMarks[i].isInSet(newMarks)) {
        textPos += getClosingDelimiter(activeMarks[i]).length
      }
    }

    // If cursor is exactly at this child boundary (between children),
    // text position is after closing delimiters but before opening delimiters.
    if (pmPos === pmOffset && pmPos > 0) {
      return textPos
    }

    // Open new marks.
    for (const mark of newMarks) {
      if (!mark.isInSet(activeMarks)) {
        textPos += getOpeningDelimiter(mark).length
      }
    }
    activeMarks = newMarks

    const childSize = child.type.name === 'text' ? (child.text?.length ?? 0) : child.nodeSize

    if (pmPos + childSize > pmOffset) {
      // Cursor is inside this child.
      const intra = pmOffset - pmPos
      if (child.isText) {
        textPos += intra
      }
      return textPos
    }

    // Advance past this child.
    if (child.isText) {
      textPos += child.text?.length ?? 0
    } else if (child.type.name === 'hardBreak') {
      textPos += 2 // "\\\n"
    } else if (child.type.name === 'image') {
      const alt = child.attrs.alt || ''
      const src = child.attrs.src || ''
      const title = child.attrs.title
      textPos += title ? `![${alt}](${src} "${title}")`.length : `![${alt}](${src})`.length
    }
    pmPos += childSize
  }

  // Cursor at the very end of inline content (after all children).
  // Don't add closing marks — cursor sits before them conceptually,
  // as closing delimiters close the last mark *around* the text.
  // However, when we reach here, pmOffset == node.content.size,
  // which means cursor is at the paragraph's end. The closing delimiters
  // are still part of the text that precedes the end-of-block position.
  // Since source mode cursor at paragraph end should be AFTER closing marks:
  for (let i = activeMarks.length - 1; i >= 0; i--) {
    textPos += getClosingDelimiter(activeMarks[i]).length
  }

  return textPos
}

/**
 * Reverse: map a text offset in serialized inline content back to PM offset.
 */
function mapTextToInlineOffset(node: PMNode, textOffset: number): number {
  let pmPos = 0
  let textPos = 0
  let activeMarks: readonly Mark[] = Mark.none

  for (let ci = 0; ci < node.childCount; ci++) {
    const child = node.child(ci)
    const newMarks = child.marks

    // Close old marks.
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      if (!activeMarks[i].isInSet(newMarks)) {
        textPos += getClosingDelimiter(activeMarks[i]).length
      }
    }

    // Open new marks.
    for (const mark of newMarks) {
      if (!mark.isInSet(activeMarks)) {
        const delim = getOpeningDelimiter(mark).length
        if (textOffset < textPos + delim) return pmPos
        textPos += delim
      }
    }
    activeMarks = newMarks

    let childTextLen = 0
    if (child.isText) {
      childTextLen = child.text?.length ?? 0
    } else if (child.type.name === 'hardBreak') {
      childTextLen = 2
    } else if (child.type.name === 'image') {
      const alt = child.attrs.alt || ''
      const src = child.attrs.src || ''
      const title = child.attrs.title
      childTextLen = title ? `![${alt}](${src} "${title}")`.length : `![${alt}](${src})`.length
    }

    if (textOffset < textPos + childTextLen) {
      const intra = textOffset - textPos
      if (child.isText) {
        return pmPos + intra
      }
      return pmPos
    }

    textPos += childTextLen
    pmPos += child.type.name === 'text' ? (child.text?.length ?? 0) : child.nodeSize
  }

  return pmPos
}

// ---------------------------------------------------------------------------
// List offset mapping
// ---------------------------------------------------------------------------

function mapListOffset(node: PMNode, pmIntra: number, listType: string): number {
  let pmPos = 0
  let textPos = 0
  const delimiter = node.attrs.delimiter || '.'
  const startNum = node.attrs.start || 1

  for (let i = 0; i < node.childCount; i++) {
    const listItem = node.child(i)

    // Compute prefix for this item.
    let prefix: string
    if (listType === 'bulletList') {
      prefix = (node.attrs.marker || '-') + ' '
    } else {
      prefix = `${startNum + i}${delimiter} `
    }

    if (pmPos + listItem.nodeSize > pmIntra) {
      // Cursor is inside this list item.
      const itemIntra = pmIntra - pmPos - 1 // -1 to enter listItem
      // First child of listItem is typically a paragraph.
      const firstChild = listItem.firstChild
      if (firstChild && firstChild.type.name === 'paragraph') {
        textPos += prefix.length
        const paraOffset = Math.min(itemIntra - 1, firstChild.content.size) // -1 to enter paragraph
        if (paraOffset >= 0) {
          textPos += mapInlineOffset(firstChild, paraOffset)
        }
      } else {
        textPos += prefix.length
      }
      return textPos
    }

    // Accumulate: prefix + content + newline
    textPos += prefix.length
    const firstChild = listItem.firstChild
    if (firstChild && firstChild.type.name === 'paragraph') {
      textPos += serializeInlineContent(firstChild).length
    }
    textPos += 1 // newline

    pmPos += listItem.nodeSize
  }

  return textPos
}

function mapTextToListOffset(node: PMNode, textIntra: number, listType: string): number {
  let pmPos = 0
  let textPos = 0
  const delimiter = node.attrs.delimiter || '.'
  const startNum = node.attrs.start || 1

  for (let i = 0; i < node.childCount; i++) {
    const listItem = node.child(i)

    let prefix: string
    if (listType === 'bulletList') {
      prefix = (node.attrs.marker || '-') + ' '
    } else {
      prefix = `${startNum + i}${delimiter} `
    }

    const firstChild = listItem.firstChild
    const contentLen = firstChild && firstChild.type.name === 'paragraph'
      ? serializeInlineContent(firstChild).length : 0
    const lineLen = prefix.length + contentLen + 1 // +1 for newline

    if (textIntra < textPos + lineLen) {
      const lineOffset = textIntra - textPos
      if (lineOffset < prefix.length) {
        // In the prefix → start of paragraph content
        return pmPos + 1 + 1 // enter listItem + enter paragraph
      }
      // In the content
      const contentOffset = lineOffset - prefix.length
      const paraIntra = firstChild ? mapTextToInlineOffset(firstChild, contentOffset) : 0
      return pmPos + 1 + 1 + paraIntra // enter listItem + enter paragraph + intra
    }

    textPos += lineLen
    pmPos += listItem.nodeSize
  }

  return pmPos
}

// ---------------------------------------------------------------------------
// Blockquote offset mapping
// ---------------------------------------------------------------------------

function mapBlockquoteOffset(node: PMNode, pmIntra: number): number {
  const marker = node.attrs.marker || '> '
  // Blockquote contains child blocks (typically paragraphs).
  // Each line is prefixed with marker.
  let pmPos = 0
  let textPos = 0

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)

    if (pmPos + child.nodeSize > pmIntra) {
      // Cursor is in this child block.
      const childIntra = pmIntra - pmPos - 1 // -1 to enter child
      textPos += marker.length
      if (child.type.name === 'paragraph') {
        textPos += mapInlineOffset(child, Math.max(0, childIntra))
      }
      return textPos
    }

    textPos += marker.length
    if (child.type.name === 'paragraph') {
      textPos += serializeInlineContent(child).length
    }
    textPos += 1 // newline
    pmPos += child.nodeSize
  }

  return textPos
}

function mapTextToBlockquoteOffset(node: PMNode, textIntra: number): number {
  const marker = node.attrs.marker || '> '
  let pmPos = 0
  let textPos = 0

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    const contentLen = child.type.name === 'paragraph'
      ? serializeInlineContent(child).length : child.textContent.length
    const lineLen = marker.length + contentLen + 1

    if (textIntra < textPos + lineLen) {
      const lineOffset = textIntra - textPos
      if (lineOffset < marker.length) return pmPos + 1 // enter paragraph → start of content
      const contentOffset = lineOffset - marker.length
      const paraIntra = child.type.name === 'paragraph'
        ? mapTextToInlineOffset(child, contentOffset) : Math.min(contentOffset, child.content.size)
      return pmPos + 1 + paraIntra
    }

    textPos += lineLen
    pmPos += child.nodeSize
  }

  return pmPos
}

// ---------------------------------------------------------------------------
// Table offset mapping
// ---------------------------------------------------------------------------

function mapTableOffset(node: PMNode, pmIntra: number, blockMd: string): number {
  // Pre-compute column widths and cell contents (same as serializeTable).
  const rows: string[][] = []
  const colWidths: number[] = []
  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => {
      let content = ''
      if (cell.childCount > 0 && cell.firstChild) {
        content = serializeInlineContent(cell.firstChild)
      }
      cells.push(content)
    })
    rows.push(cells)
  })
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const width = row[i].length
      if (!colWidths[i] || width > colWidths[i]) {
        colWidths[i] = Math.max(width, 3)
      }
    }
  }

  // Walk through PM structure to find which row/cell the cursor is in.
  let pmPos = 0 // offset within table content (after table open token)

  for (let rowIdx = 0; rowIdx < node.childCount; rowIdx++) {
    const row = node.child(rowIdx)
    const rowStart = pmPos + 1 // +1 for tableRow open token
    const rowEnd = pmPos + row.nodeSize

    if (pmIntra < rowEnd) {
      // Cursor is in this row. Find which cell.
      let cellPmPos = rowStart // position after tableRow open
      for (let cellIdx = 0; cellIdx < row.childCount; cellIdx++) {
        const cell = row.child(cellIdx)
        const cellStart = cellPmPos + 1 // +1 for tableCell open token
        const cellEnd = cellPmPos + cell.nodeSize

        if (pmIntra < cellEnd) {
          // Cursor is in this cell. Find position within cell's paragraph.
          let paraIntra = 0
          if (cell.firstChild) {
            const paraStart = cellStart + 1 // +1 for paragraph open token
            paraIntra = Math.max(0, pmIntra - paraStart)
            paraIntra = Math.min(paraIntra, cell.firstChild.content.size)
          }

          // Map to text position in the serialized row line.
          const cellContent = rows[rowIdx]?.[cellIdx] ?? ''
          const cellTextOffset = cell.firstChild
            ? mapInlineOffset(cell.firstChild, paraIntra)
            : 0

          // Compute text position: row line prefix + cell positions.
          const textLineStart = getTableLineStart(rows, colWidths, rowIdx)
          // Position within the row line: "| " + cell0.padEnd(w0) + " | " + ...
          let posInLine = 2 // "| " prefix
          for (let ci = 0; ci < cellIdx; ci++) {
            posInLine += (colWidths[ci] || 3) + 3 // content_padded + " | "
          }
          posInLine += Math.min(cellTextOffset, cellContent.length)
          return textLineStart + posInLine
        }
        cellPmPos += cell.nodeSize
      }
      // Fallback: end of row
      const textLineStart = getTableLineStart(rows, colWidths, rowIdx)
      const rowLine = formatTableRow(rows[rowIdx] || [], colWidths)
      return textLineStart + rowLine.length
    }
    pmPos += row.nodeSize
  }

  // Fallback
  return blockMd.length
}

/** Get the character offset where a specific table row's text line starts. */
function getTableLineStart(rows: string[][], colWidths: number[], rowIdx: number): number {
  // Row 0 → line 0, separator → line 1, row N (N>0) → line N+1
  const lineLength = (cells: string[]) => formatTableRow(cells, colWidths).length + 1 // +1 for \n
  const separatorLength = ('| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |').length + 1

  let offset = 0
  if (rowIdx === 0) return 0
  // Header row (line 0)
  offset += lineLength(rows[0])
  // Separator (line 1)
  offset += separatorLength
  // Data rows (line 2+)
  for (let i = 1; i < rowIdx; i++) {
    offset += lineLength(rows[i])
  }
  return offset
}

/** Reverse: map text offset within table markdown back to PM intra-node offset. */
function mapTextToTableOffset(node: PMNode, textIntra: number, blockMd: string): number {
  // Pre-compute column widths and cell contents.
  const rows: string[][] = []
  const colWidths: number[] = []
  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell) => {
      let content = ''
      if (cell.childCount > 0 && cell.firstChild) {
        content = serializeInlineContent(cell.firstChild)
      }
      cells.push(content)
    })
    rows.push(cells)
  })
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const width = row[i].length
      if (!colWidths[i] || width > colWidths[i]) {
        colWidths[i] = Math.max(width, 3)
      }
    }
  }

  // Determine which line the text offset falls on.
  const lines = blockMd.split('\n')
  let lineTextPos = 0
  let lineIdx = 0
  for (let i = 0; i < lines.length; i++) {
    if (textIntra < lineTextPos + lines[i].length + 1) {
      lineIdx = i
      break
    }
    lineTextPos += lines[i].length + 1
  }

  // Map line index to row index (line 0=header, line 1=separator, line 2+=data rows)
  let rowIdx: number
  if (lineIdx === 0) {
    rowIdx = 0
  } else if (lineIdx === 1) {
    // Separator line — place cursor at start of first data row or header
    rowIdx = node.childCount > 1 ? 1 : 0
  } else {
    rowIdx = lineIdx - 1 // line 2→row 1, line 3→row 2, etc.
  }
  rowIdx = Math.min(rowIdx, node.childCount - 1)

  // Find position within the row line.
  const posInLine = textIntra - lineTextPos

  // Parse cell index from position in line: "| c0_pad | c1_pad | ..."
  let cellIdx = 0
  let charPos = 2 // skip "| "
  for (let ci = 0; ci < (colWidths.length - 1); ci++) {
    const nextCellStart = charPos + (colWidths[ci] || 3) + 3 // content + " | "
    if (posInLine < nextCellStart) {
      cellIdx = ci
      break
    }
    charPos = nextCellStart
    cellIdx = ci + 1
  }
  cellIdx = Math.min(cellIdx, (rows[rowIdx]?.length ?? 1) - 1)
  const cellTextOffset = Math.max(0, posInLine - charPos)

  // Navigate PM structure to find the target position.
  const row = node.child(Math.min(rowIdx, node.childCount - 1))
  let pmPos = 0
  // Skip to target row
  for (let i = 0; i < Math.min(rowIdx, node.childCount - 1); i++) {
    pmPos += node.child(i).nodeSize
  }
  pmPos += 1 // enter tableRow

  // Skip to target cell
  const targetCellIdx = Math.min(cellIdx, row.childCount - 1)
  for (let i = 0; i < targetCellIdx; i++) {
    pmPos += row.child(i).nodeSize
  }
  pmPos += 1 // enter tableCell
  pmPos += 1 // enter paragraph

  // Map text offset within cell content to PM inline offset.
  const cell = row.child(targetCellIdx)
  if (cell.firstChild) {
    const cellContent = rows[rowIdx]?.[targetCellIdx] ?? ''
    const clampedOffset = Math.min(cellTextOffset, cellContent.length)
    pmPos += mapTextToInlineOffset(cell.firstChild, clampedOffset)
  }

  return pmPos
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

  /** Get the raw output without trailing newline normalization.
   *  Used by offset mapping helpers for per-block serialization. */
  getRawOutput(): string {
    return this.output
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
    case 'htmlBlock':
      serializeHtmlBlock(node, state)
      break
    case 'mathBlock':
      serializeMathBlock(node, state)
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
  // Empty paragraph = preserved blank line.
  // Output an extra newline so consecutive empty paragraphs produce multiple blank lines.
  if (node.childCount === 0 || (node.textContent === '' && !node.firstChild)) {
    state.write('\n')
    state.markBlockWritten()
    return
  }
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

function serializeHtmlBlock(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  state.write(node.attrs.html || '')
  state.write('\n')
  state.markBlockWritten()
}

function serializeMathBlock(node: PMNode, state: SerializeState): void {
  state.ensureBlankLine()
  state.write('$$\n')
  state.write(node.attrs.latex || '')
  state.write('\n$$\n')
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
    } else if (child.type.name === 'mathInline') {
      result += `$${child.attrs.latex}$`
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
