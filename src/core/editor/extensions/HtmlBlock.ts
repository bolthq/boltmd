/**
 * HtmlBlock — Atom node for preserving raw HTML blocks in the editor.
 *
 * When markdown contains block-level HTML (e.g. `<div align="center">` with
 * inline badges), markdown-it emits an `html_block` token. This extension
 * stores the raw HTML as an opaque atom node so that:
 *
 * 1. WYSIWYG mode renders the actual HTML DOM (badges display inline)
 * 2. Source mode shows the raw markup (editable as text)
 * 3. Round-trip serialization preserves the original HTML verbatim
 *
 * The node is `atom: true` — it cannot be edited directly in WYSIWYG mode.
 * Users must switch to source mode to modify raw HTML content.
 */

import { Node } from '@tiptap/core'

export const HtmlBlock = Node.create({
  name: 'htmlBlock',

  group: 'block',

  // Atom: treated as a single unit, not editable inline.
  atom: true,

  // Not draggable by default (prevents accidental reordering).
  draggable: false,

  addAttributes() {
    return {
      html: {
        default: '',
        // Never render as DOM attribute.
        renderHTML: () => ({}),
        parseHTML: () => '',
      },
    }
  },

  // Parse from DOM: match <div data-html-block> wrapper.
  parseHTML() {
    return [
      {
        tag: 'div[data-html-block]',
      },
    ]
  },

  // Render to DOM: wrapper div with data attribute for identification.
  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-html-block': '', ...HTMLAttributes }, 0]
  },

  // Custom NodeView to render actual HTML content in WYSIWYG mode.
  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-html-block', '')
      wrapper.classList.add('html-block-view')
      wrapper.contentEditable = 'false'

      // Render the raw HTML inside the wrapper.
      wrapper.innerHTML = node.attrs.html

      return {
        dom: wrapper,
        // No contentDOM — atom node, no editable content.
        update(updatedNode) {
          if (updatedNode.type.name !== 'htmlBlock') return false
          wrapper.innerHTML = updatedNode.attrs.html
          return true
        },
      }
    }
  },
})
