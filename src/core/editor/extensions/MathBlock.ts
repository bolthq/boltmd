/**
 * MathBlock — Block-level math node rendered via KaTeX.
 *
 * Stores LaTeX source in the `latex` attribute and renders it as a
 * display-mode formula (centered, larger). The node is `atom: true` —
 * not editable directly in WYSIWYG mode.
 *
 * Follows the same lazy-loading pattern as MathInline for KaTeX.
 */

import { Node } from '@tiptap/core'

export const MathBlock = Node.create({
  name: 'mathBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        renderHTML: () => ({}),
        parseHTML: () => '',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-math-block': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-math-block', '')
      wrapper.classList.add('math-block-view')
      wrapper.contentEditable = 'false'

      const renderMath = async (latex: string) => {
        try {
          const katex = await import('katex')
          katex.default.render(latex, wrapper, {
            throwOnError: false,
            displayMode: true,
          })
        } catch {
          // Fallback: show raw LaTeX
          wrapper.textContent = `$$${latex}$$`
          wrapper.classList.add('math-render-error')
        }
      }

      renderMath(node.attrs.latex)

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mathBlock') return false
          renderMath(updatedNode.attrs.latex)
          return true
        },
      }
    }
  },
})
