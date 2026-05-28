/**
 * MathInline — Inline math node rendered via KaTeX.
 *
 * Stores LaTeX source in the `latex` attribute and renders it as an
 * inline formula. The node is `inline: true, atom: true` — it cannot
 * be edited directly in WYSIWYG mode; users edit in source mode.
 *
 * In WYSIWYG mode, a custom NodeView lazily loads KaTeX and renders
 * the formula. If rendering fails, falls back to showing the raw LaTeX
 * in a styled <code> element.
 */

import { Node } from '@tiptap/core'

export const MathInline = Node.create({
  name: 'mathInline',

  group: 'inline',

  inline: true,

  atom: true,

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
        tag: 'span[data-math-inline]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-math-inline': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node }) => {
      const span = document.createElement('span')
      span.setAttribute('data-math-inline', '')
      span.classList.add('math-inline-view')
      span.contentEditable = 'false'

      const renderMath = async (latex: string) => {
        try {
          const katex = await import('katex')
          katex.default.render(latex, span, {
            throwOnError: false,
            displayMode: false,
          })
        } catch {
          // Fallback: show raw LaTeX in a code-like style
          span.textContent = `$${latex}$`
          span.classList.add('math-render-error')
        }
      }

      renderMath(node.attrs.latex)

      return {
        dom: span,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mathInline') return false
          renderMath(updatedNode.attrs.latex)
          return true
        },
      }
    }
  },
})
