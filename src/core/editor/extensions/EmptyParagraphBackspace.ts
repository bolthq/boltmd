/**
 * ParagraphBackspace — Fix for backspace issues on loaded markdown content.
 *
 * ProseMirror's default `joinBackward` command uses `view.endOfTextblock("backward")`
 * which is a DOM-based measurement. After programmatically loading content via
 * `tr.replaceWith()`, this DOM check can return incorrect results, causing the
 * first Backspace press to do nothing.
 *
 * This extension provides a reliable, state-based Backspace handler for paragraphs
 * that does NOT depend on DOM measurement:
 *
 * 1. Cursor is IN a visually-empty paragraph → delete it, move to prev block end.
 * 2. Cursor is at start of a non-empty paragraph and the PREVIOUS sibling is
 *    a visually-empty paragraph → delete the previous empty paragraph.
 * 3. Cursor is at start of a non-empty paragraph, previous sibling is a
 *    non-empty paragraph → join them (state-based, no endOfTextblock check).
 */

import { Extension } from '@tiptap/core'
import { Selection, TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Check if a paragraph is "visually empty" — either truly empty (content.size === 0)
 * or contains only zero-width/whitespace characters (from parser sentinels or leaked \u200B).
 */
function isVisuallyEmpty(node: PMNode): boolean {
  if (node.content.size === 0) return true
  // Check for zero-width space sentinels, whitespace-only, or any mix of \u200B and whitespace
  const text = node.textContent
  if (text.trim() === '') return true
  if (/^[\u200B\s]+$/.test(text)) return true
  return false
}

export const EmptyParagraphBackspace = Extension.create({
  name: 'emptyParagraphBackspace',
  priority: 101, // Higher than default (100) so it runs before StarterKit's keymap

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const { $from, empty: isCollapsed } = selection

        // Only handle collapsed (non-range) selections.
        if (!isCollapsed) return false

        // Must be at the very start of the current textblock.
        if ($from.parentOffset !== 0) return false

        // The parent must be a paragraph.
        const parent = $from.parent
        if (parent.type.name !== 'paragraph') return false

        // Must be inside a parent that has siblings (not the only child).
        const grandparent = $from.node($from.depth - 1)
        if (grandparent.childCount <= 1) return false

        // Get index of current paragraph within its parent.
        const indexInParent = $from.index($from.depth - 1)

        // Case 1: Current paragraph IS visually empty — delete it.
        if (isVisuallyEmpty(parent)) {
          const docPos = $from.before($from.depth)
          const tr = state.tr
          tr.delete(docPos, docPos + parent.nodeSize)

          if (docPos === 0) {
            // Was the first node: place cursor at start of the new first block.
            const newSelection = Selection.near(tr.doc.resolve(0), 1)
            tr.setSelection(newSelection)
          } else {
            // Place cursor at the end of the previous block.
            const resolvedPos = tr.doc.resolve(Math.max(docPos - 1, 0))
            const endOfPrevBlock = resolvedPos.end(resolvedPos.depth)
            tr.setSelection(TextSelection.near(tr.doc.resolve(endOfPrevBlock)))
          }

          editor.view.dispatch(tr)
          return true
        }

        // Need a previous sibling for Case 2 and Case 3.
        if (indexInParent <= 0) return false

        const prevSibling = grandparent.child(indexInParent - 1)

        // Case 2: Previous sibling is a visually-empty paragraph — delete it.
        if (prevSibling.type.name === 'paragraph' && isVisuallyEmpty(prevSibling)) {
          const currentParaPos = $from.before($from.depth)
          const prevParaPos = currentParaPos - prevSibling.nodeSize
          const tr = state.tr
          tr.delete(prevParaPos, prevParaPos + prevSibling.nodeSize)
          editor.view.dispatch(tr)
          return true
        }

        // Case 3: Previous sibling is a non-empty paragraph — join them.
        // This replaces ProseMirror's default joinBackward which relies on
        // view.endOfTextblock("backward") DOM measurement that can fail after
        // programmatic content loading via tr.replaceWith().
        if (prevSibling.type.name === 'paragraph') {
          const currentParaPos = $from.before($from.depth)
          const tr = state.tr
          // Both sides are paragraphs (same type, compatible content) so join is always valid.
          try {
            tr.join(currentParaPos)
            editor.view.dispatch(tr)
            return true
          } catch {
            // Join failed for unexpected reason — fall through to default handlers.
          }
        }

        // Not our case — let default handlers handle it.
        return false
      },
    }
  },
})
