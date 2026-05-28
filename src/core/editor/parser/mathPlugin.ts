/**
 * markdown-it plugin for math formulas.
 *
 * Supports:
 * - Inline math: $...$ (single dollar)
 * - Block math:  $$...$$ (double dollar, on their own lines)
 *
 * Produces tokens:
 * - `math_inline` with content = formula text
 * - `math_block`  with content = formula text
 */

import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'

/**
 * Inline rule: match $...$ where:
 * - Opening $ is not preceded by a backslash or another $
 * - Closing $ is not preceded by a backslash
 * - Content is not empty
 */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const start = state.pos

  // Must start with $
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false

  // Must not be $$ (that's block syntax used inline — treat as literal)
  if (src.charCodeAt(start + 1) === 0x24) return false

  // Must not be escaped
  if (start > 0 && src.charCodeAt(start - 1) === 0x5C /* \ */) return false

  // Find closing $
  let end = start + 1
  while (end < state.posMax) {
    const ch = src.charCodeAt(end)
    if (ch === 0x24 /* $ */ && src.charCodeAt(end - 1) !== 0x5C /* \ */) {
      break
    }
    end++
  }

  // No closing $ found
  if (end >= state.posMax) return false

  // Content must not be empty
  const content = src.slice(start + 1, end)
  if (!content.trim()) return false

  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.content = content
    token.markup = '$'
  }

  state.pos = end + 1
  return true
}

/**
 * Block rule: match $$...$$ where opening $$ is on its own line
 * and closing $$ is on its own line.
 */
function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine]
  const maxPos = state.eMarks[startLine]

  // Must start with $$
  if (startPos + 1 >= maxPos) return false
  if (state.src.charCodeAt(startPos) !== 0x24) return false
  if (state.src.charCodeAt(startPos + 1) !== 0x24) return false

  // The rest of the opening line after $$ (could have info string, but we ignore it)
  const openLineRest = state.src.slice(startPos + 2, maxPos).trim()

  // If the whole thing is on one line: $$...$$
  if (openLineRest.endsWith('$$') && openLineRest.length > 2) {
    if (silent) return true
    const content = openLineRest.slice(0, -2).trim()
    const token = state.push('math_block', 'math', 0)
    token.content = content
    token.markup = '$$'
    token.map = [startLine, startLine + 1]
    state.line = startLine + 1
    return true
  }

  // Multi-line: find closing $$
  let nextLine = startLine + 1
  let found = false

  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine] + state.tShift[nextLine]
    const lineEnd = state.eMarks[nextLine]
    const lineText = state.src.slice(lineStart, lineEnd).trim()

    if (lineText === '$$') {
      found = true
      break
    }
    nextLine++
  }

  if (!found) return false
  if (silent) return true

  // Collect content between $$ lines
  const contentLines: string[] = []
  for (let line = startLine + 1; line < nextLine; line++) {
    contentLines.push(state.getLines(line, line + 1, state.tShift[line], false).replace(/\n$/, ''))
  }
  const content = contentLines.join('\n')

  const token = state.push('math_block', 'math', 0)
  token.content = content
  token.markup = '$$'
  token.map = [startLine, nextLine + 1]

  state.line = nextLine + 1
  return true
}

/**
 * Install the math plugin into a markdown-it instance.
 */
export function mathPlugin(md: MarkdownIt): void {
  // Block rule: must run before fence (priority matters)
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })

  // Inline rule: run after escape processing
  md.inline.ruler.after('escape', 'math_inline', mathInlineRule)
}
