/**
 * MermaidBlock — Block-level diagram node rendered via Mermaid.js.
 *
 * Recognizes ```mermaid code blocks and renders them as SVG diagrams
 * in WYSIWYG mode. The node is `atom: true` — editing requires source mode.
 *
 * Mermaid.js is lazily loaded via dynamic import to avoid impacting
 * startup performance (~2MB library).
 */

import { Node } from '@tiptap/core'

// Unique ID counter for mermaid rendering targets.
let mermaidIdCounter = 0

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',

  group: 'block',

  atom: true,

  draggable: false,

  addAttributes() {
    return {
      code: {
        default: '',
        renderHTML: () => ({}),
        parseHTML: () => '',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-mermaid-block]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-mermaid-block': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-mermaid-block', '')
      wrapper.classList.add('mermaid-block-view')
      wrapper.contentEditable = 'false'

      const renderDiagram = async (code: string) => {
        if (!code.trim()) {
          wrapper.innerHTML = '<span class="mermaid-empty">Empty mermaid diagram</span>'
          return
        }

        try {
          const mermaid = await import('mermaid')
          // Initialize mermaid with safe defaults (no interaction).
          mermaid.default.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'strict',
          })

          const id = `mermaid-${++mermaidIdCounter}`
          const { svg } = await mermaid.default.render(id, code)
          wrapper.innerHTML = svg
        } catch (err) {
          // Render error: show the raw code with error message.
          wrapper.innerHTML = ''
          wrapper.classList.add('mermaid-render-error')
          const errorMsg = document.createElement('span')
          errorMsg.className = 'mermaid-error-label'
          errorMsg.textContent = 'Mermaid syntax error'
          wrapper.appendChild(errorMsg)
          const pre = document.createElement('pre')
          pre.textContent = code
          wrapper.appendChild(pre)
        }
      }

      renderDiagram(node.attrs.code)

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type.name !== 'mermaidBlock') return false
          wrapper.classList.remove('mermaid-render-error')
          renderDiagram(updatedNode.attrs.code)
          return true
        },
      }
    }
  },
})
