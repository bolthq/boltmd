/**
 * HeadingHighlight extension
 *
 * Provides a temporary visual flash on a heading node when jumping to it
 * from the outline panel. Uses ProseMirror Decorations so the class is
 * managed by the framework and won't be stripped on re-render.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Transaction, EditorState } from '@tiptap/pm/state'

export const headingHighlightKey = new PluginKey<HeadingHighlightState>('headingHighlight')

interface HeadingHighlightState {
  decorations: DecorationSet
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingHighlight: {
      /** Flash a heading node at the given document position (nodePos). */
      flashHeading: (nodePos: number) => ReturnType
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
    return [
      new Plugin<HeadingHighlightState>({
        key: headingHighlightKey,

        state: {
          init(): HeadingHighlightState {
            return { decorations: DecorationSet.empty }
          },

          apply(tr: Transaction, prev: HeadingHighlightState, _oldState: EditorState, newState: EditorState): HeadingHighlightState {
            const meta = tr.getMeta(headingHighlightKey) as
              | { type: 'flash'; pos: number }
              | { type: 'clear' }
              | undefined

            if (meta?.type === 'flash') {
              // Resolve the node at the given position.
              const node = newState.doc.nodeAt(meta.pos)
              if (node && node.type.name === 'heading') {
                const from = meta.pos
                const to = from + node.nodeSize
                const deco = Decoration.node(from, to, { class: 'heading-jump-highlight' })
                return { decorations: DecorationSet.create(newState.doc, [deco]) }
              }
              return prev
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
      }),
    ]
  },
})
