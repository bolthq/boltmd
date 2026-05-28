/**
 * Frontmatter — Atom node for YAML frontmatter metadata blocks.
 *
 * YAML frontmatter is the `---` delimited block at the very start of a
 * markdown file. It stores metadata (title, date, tags, etc.) and is not
 * rendered as document content.
 *
 * In WYSIWYG mode this displays as a styled metadata card with the raw
 * YAML visible in monospace font. The node is `atom: true` — editing
 * requires source mode.
 *
 * The node is constrained to appear only at position 0 in the document.
 */

import { Node } from '@tiptap/core'

export const Frontmatter = Node.create({
  name: 'frontmatter',

  group: 'block',

  atom: true,

  draggable: false,

  // Frontmatter should always be the first node if present.
  defining: true,

  addAttributes() {
    return {
      yaml: {
        default: '',
        renderHTML: () => ({}),
        parseHTML: () => '',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-frontmatter]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-frontmatter': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-frontmatter', '')
      wrapper.classList.add('frontmatter-view')
      wrapper.contentEditable = 'false'

      const renderContent = (yaml: string) => {
        // Clear previous content
        wrapper.innerHTML = ''

        // Label
        const label = document.createElement('span')
        label.className = 'frontmatter-label'
        label.textContent = 'Frontmatter'
        wrapper.appendChild(label)

        // YAML content
        const pre = document.createElement('pre')
        pre.className = 'frontmatter-content'
        pre.textContent = yaml
        wrapper.appendChild(pre)
      }

      renderContent(node.attrs.yaml)

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type.name !== 'frontmatter') return false
          renderContent(updatedNode.attrs.yaml)
          return true
        },
      }
    }
  },
})
