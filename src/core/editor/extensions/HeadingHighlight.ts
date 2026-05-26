/**
 * HeadingHighlight extension
 *
 * Provides a temporary visual flash on a heading node when jumping to it
 * from the outline panel, and on the cursor's top-level block when switching
 * editor modes (flashCursorBlock).  Uses ProseMirror Decorations so the
 * class is managed by the framework and won't be stripped on re-render.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Transaction, EditorState } from '@tiptap/pm/state'

export const headingHighlightKey = new PluginKey<HeadingHighlightState>('headingHighlight')

interface HeadingHighlightState {
  decorations: DecorationSet
}

/**
 * Create the raw PM plugin for heading/cursor-block highlighting.
 * Shared between Tiptap (via the Extension) and PMSourceEditor (standalone).
 */
export function createHighlightPlugin(): Plugin<HeadingHighlightState> {
  return new Plugin<HeadingHighlightState>({
    key: headingHighlightKey,

    state: {
      init(): HeadingHighlightState {
        return { decorations: DecorationSet.empty }
      },

      apply(tr: Transaction, prev: HeadingHighlightState, _oldState: EditorState, newState: EditorState): HeadingHighlightState {
        const meta = tr.getMeta(headingHighlightKey) as
          | { type: 'flash'; pos: number }
          | { type: 'flashBlock'; pos: number }
          | { type: 'flashInline'; from: number; to: number }
          | { type: 'clear' }
          | undefined

        if (meta?.type === 'flash') {
          const node = newState.doc.nodeAt(meta.pos)
          if (node && node.type.name === 'heading') {
            const from = meta.pos
            const to = from + node.nodeSize
            const deco = Decoration.node(from, to, { class: 'heading-jump-highlight' })
            return { decorations: DecorationSet.create(newState.doc, [deco]) }
          }
          return prev
        }

        if (meta?.type === 'flashBlock') {
          const node = newState.doc.nodeAt(meta.pos)
          if (node) {
            const from = meta.pos
            const to = from + node.nodeSize
            const deco = Decoration.node(from, to, { class: 'cursor-block-highlight' })
            return { decorations: DecorationSet.create(newState.doc, [deco]) }
          }
          return prev
        }

        if (meta?.type === 'flashInline') {
          const deco = Decoration.inline(meta.from, meta.to, { class: 'cursor-block-highlight' })
          return { decorations: DecorationSet.create(newState.doc, [deco]) }
        }

        if (meta?.type === 'clear') {
          return { decorations: DecorationSet.empty }
        }

        // If doc changed, map existing decorations.
        if (tr.docChanged) {
          return { decorations: prev.decorations.map(tr.mapping, tr.doc) }
        }

        return prev
      },
    },

    props: {
      decorations(state: EditorState) {
        return headingHighlightKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
  })
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingHighlight: {
      /** Flash a heading node at the given document position (nodePos). */
      flashHeading: (nodePos: number) => ReturnType
      /** Flash the top-level block that contains the current cursor. */
      flashCursorBlock: () => ReturnType
      /** Clear the heading highlight immediately. */
      clearHeadingHighlight: () => ReturnType
    }
  }
}

export const HeadingHighlight = Extension.create({
  name: 'headingHighlight',

  addCommands() {
    return {
      flashHeading:
        (nodePos: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingHighlightKey, { type: 'flash', pos: nodePos })
            dispatch(tr)
          }
          return true
        },

      flashCursorBlock:
        () =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            // Highlight the current line (inline decoration).
            const pos = state.selection.from
            const resolved = state.doc.resolve(pos)
            const textblock = resolved.parent
            const textblockStart = resolved.start()

            if (textblock.type.name === 'codeBlock') {
              // For code blocks, highlight only the current line.
              const text = textblock.textContent
              const offset = Math.min(pos - textblockStart, text.length)
              const lineStart = text.lastIndexOf('\n', offset - 1) + 1
              let lineEnd = text.indexOf('\n', offset)
              if (lineEnd === -1) lineEnd = text.length
              const from = textblockStart + lineStart
              const to = textblockStart + lineEnd
              if (from < to) {
                tr.setMeta(headingHighlightKey, { type: 'flashInline', from, to })
              }
            } else {
              // For paragraphs, headings, list items: highlight full textblock content.
              const from = textblockStart
              const to = textblockStart + textblock.content.size
              if (from < to) {
                tr.setMeta(headingHighlightKey, { type: 'flashInline', from, to })
              }
            }
            dispatch(tr)
          }
          return true
        },

      clearHeadingHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingHighlightKey, { type: 'clear' })
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [createHighlightPlugin()]
  },
})
