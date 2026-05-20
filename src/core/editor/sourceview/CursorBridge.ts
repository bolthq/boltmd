/**
 * CursorBridge — Keyboard navigation between PM content and delimiter spans.
 *
 * In source mode, delimiter spans (**, `, ~~, etc.) are outside PM's content
 * model. This module provides keymap handlers that bridge cursor movement
 * between PM content areas and adjacent delimiter elements.
 *
 * Specifically:
 * - ArrowLeft at the start of marked content → focus preceding delimiter span
 * - ArrowRight at the end of marked content → focus following delimiter span
 * - ArrowLeft at the start of delimiter → return focus to PM (preceding content)
 * - ArrowRight at the end of delimiter → return focus to PM (following content)
 *
 * Since we only target WebView2 (Chromium), cursor behavior is predictable
 * and this ~50 lines of keymap code is all that's needed.
 */

import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state'

export const cursorBridgeKey = new PluginKey('cursorBridge')

/**
 * Create the cursor bridge plugin for source mode.
 * Intercepts arrow key events to bridge between content and delimiter areas.
 */
export function createCursorBridgePlugin(): Plugin {
  return new Plugin({
    key: cursorBridgeKey,

    props: {
      handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        if (event.key === 'ArrowLeft') {
          return handleArrowLeft(view)
        }
        if (event.key === 'ArrowRight') {
          return handleArrowRight(view)
        }
        return false
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Arrow Left: content start → preceding delimiter
// ---------------------------------------------------------------------------

function handleArrowLeft(view: EditorView): boolean {
  const { from } = view.state.selection
  if (from === 0) return false

  // Check if cursor is at the very start of a mark's content range.
  // If so, find the preceding delimiter span in the DOM and focus it.
  const $pos = view.state.doc.resolve(from)
  const marks = $pos.marks()

  if (marks.length === 0) return false

  // Only act when at the start of the first text node within a mark
  if ($pos.parentOffset !== 0) return false

  // Find the DOM element for the current position
  try {
    const domPos = view.domAtPos(from)
    const node = domPos.node
    const element = node instanceof HTMLElement ? node : node.parentElement
    if (!element) return false

    // Look for a preceding sibling that is a delimiter span
    const markContent = element.closest('.src-mark-content')
    if (!markContent) return false

    const delimOpen = markContent.previousElementSibling
    if (!delimOpen || !delimOpen.classList.contains('src-delimiter')) return false

    // Focus the delimiter and place cursor at its end
    setCursorToEnd(delimOpen as HTMLElement)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Arrow Right: content end → following delimiter
// ---------------------------------------------------------------------------

function handleArrowRight(view: EditorView): boolean {
  const { from, to } = view.state.selection
  if (from !== to) return false // Don't intercept if there's a selection

  const $pos = view.state.doc.resolve(from)
  const marks = $pos.marks()

  if (marks.length === 0) return false

  // Check if cursor is at the end of marked content
  const parent = $pos.parent
  if ($pos.parentOffset !== parent.content.size) return false

  // Find the DOM element for the current position
  try {
    const domPos = view.domAtPos(from)
    const node = domPos.node
    const element = node instanceof HTMLElement ? node : node.parentElement
    if (!element) return false

    // Look for a following sibling that is a delimiter span
    const markContent = element.closest('.src-mark-content')
    if (!markContent) return false

    const delimClose = markContent.nextElementSibling
    if (!delimClose || !delimClose.classList.contains('src-delimiter')) return false

    // Focus the delimiter and place cursor at its start
    setCursorToStart(delimClose as HTMLElement)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Delimiter → PM content navigation (event listeners on delimiter spans)
// ---------------------------------------------------------------------------

/**
 * Attach keydown listeners to a delimiter span for navigating back to PM content.
 * Call this when creating MarkView delimiter elements.
 *
 * @param delimEl - The delimiter span element
 * @param view - The PM EditorView
 * @param direction - 'open' for opening delimiter (→ navigates into content),
 *                    'close' for closing delimiter (← navigates into content)
 * @param getContentPos - Function returning the PM position to focus
 */
export function attachDelimiterNavigation(
  delimEl: HTMLElement,
  view: EditorView,
  direction: 'open' | 'close',
  getContentPos: () => number,
): void {
  delimEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (direction === 'open' && e.key === 'ArrowRight' && isCursorAtEnd(delimEl)) {
      e.preventDefault()
      const pos = getContentPos()
      view.focus()
      const { tr } = view.state
      view.dispatch(tr.setSelection(
        Selection.near(view.state.doc.resolve(pos)),
      ))
    }

    if (direction === 'close' && e.key === 'ArrowLeft' && isCursorAtStart(delimEl)) {
      e.preventDefault()
      const pos = getContentPos()
      view.focus()
      const { tr } = view.state
      view.dispatch(tr.setSelection(
        Selection.near(view.state.doc.resolve(pos), -1),
      ))
    }
  })
}

// ---------------------------------------------------------------------------
// DOM cursor utilities
// ---------------------------------------------------------------------------

/** Set the browser cursor to the end of an element's text content. */
function setCursorToEnd(el: HTMLElement): void {
  el.focus()
  const range = document.createRange()
  const sel = window.getSelection()
  if (!sel) return
  if (el.childNodes.length > 0) {
    const lastChild = el.childNodes[el.childNodes.length - 1]
    range.setStartAfter(lastChild)
  } else {
    range.setStart(el, 0)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Set the browser cursor to the start of an element's text content. */
function setCursorToStart(el: HTMLElement): void {
  el.focus()
  const range = document.createRange()
  const sel = window.getSelection()
  if (!sel) return
  if (el.childNodes.length > 0) {
    range.setStartBefore(el.childNodes[0])
  } else {
    range.setStart(el, 0)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Check if the browser cursor is at the end of an element. */
function isCursorAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  // Check if cursor is at the end
  const testRange = document.createRange()
  testRange.selectNodeContents(el)
  testRange.setStart(range.endContainer, range.endOffset)
  return testRange.toString().length === 0
}

/** Check if the browser cursor is at the start of an element. */
function isCursorAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  // Check if cursor is at the start
  const testRange = document.createRange()
  testRange.selectNodeContents(el)
  testRange.setEnd(range.startContainer, range.startOffset)
  return testRange.toString().length === 0
}
