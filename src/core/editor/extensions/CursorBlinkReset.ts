/**
 * CursorBlinkReset — Force the browser to restart its caret blink cycle
 * whenever the ProseMirror selection changes.
 *
 * Problem: Browsers reset the caret blink timer on user-initiated input
 * (keypress, click) but NOT on programmatic selection changes via
 * `transaction.setSelection()`. This means that after our custom Backspace
 * handler (or any command that programmatically moves the cursor), the caret
 * may remain invisible for up to half a blink cycle, making users lose track
 * of the cursor position.
 *
 * Solution: After each selection change, re-apply the same DOM selection.
 * This tricks the browser into thinking a new selection was placed, which
 * resets the blink timer so the caret is immediately visible.
 */

import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

/** Standalone ProseMirror plugin (for use in PMSourceEditor). */
export function createCursorBlinkResetPlugin(): Plugin {
  let scheduled = false

  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          if (view.state.selection.eq(prevState.selection)) return
          if (!view.hasFocus()) return
          if (scheduled) return

          scheduled = true

          requestAnimationFrame(() => {
            scheduled = false
            if (!view.hasFocus()) return

            const domSel = document.getSelection()
            if (!domSel || domSel.rangeCount === 0) return

            // Use setBaseAndExtent to preserve selection direction.
            // Range.cloneRange() would lose backward selections.
            const { anchorNode, anchorOffset, focusNode, focusOffset } = domSel
            if (!anchorNode || !focusNode) return

            domSel.removeAllRanges()
            domSel.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
          })
        },
      }
    },
  })
}

/** Tiptap extension wrapper (for use in WysiwygEditor). */
export const CursorBlinkReset = Extension.create({
  name: 'cursorBlinkReset',

  addProseMirrorPlugins() {
    return [createCursorBlinkResetPlugin()]
  },
})
