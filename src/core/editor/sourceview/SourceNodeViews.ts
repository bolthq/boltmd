/**
 * Source-mode NodeViews — Block-level node rendering for source editing mode.
 *
 * Each NodeView renders the node with its original markdown syntax visible
 * and editable. The prefix/marker area is managed outside PM's content model
 * and edits there dispatch attribute-update transactions.
 *
 * These NodeViews are registered on the raw PM EditorView used in source mode.
 * The WYSIWYG Tiptap Editor uses standard rendering and never sees these.
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from '@tiptap/pm/view'
import { defaultHeadingPrefix } from '../extensions/FormatAttrs'

// ---------------------------------------------------------------------------
// Heading NodeView
// ---------------------------------------------------------------------------

class HeadingSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private prefixEl: HTMLElement
  private node: PMNode
  private view: EditorView
  private getPos: () => number | undefined

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node
    this.view = view
    this.getPos = getPos

    this.dom = document.createElement('div')
    this.dom.className = `src-heading src-heading-${node.attrs.level}`

    // Editable prefix area (e.g. "## ")
    this.prefixEl = document.createElement('span')
    this.prefixEl.className = 'src-prefix'
    this.prefixEl.setAttribute('contenteditable', 'true')
    this.prefixEl.setAttribute('spellcheck', 'false')
    this.prefixEl.textContent = node.attrs.prefix || defaultHeadingPrefix(node.attrs.level)

    // PM-managed content area
    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'src-content'

    this.dom.append(this.prefixEl, this.contentDOM)

    // Handle prefix edits
    this.prefixEl.addEventListener('input', this.onPrefixInput)
  }

  private onPrefixInput = (): void => {
    const newPrefix = this.prefixEl.textContent || ''
    const hashMatch = newPrefix.match(/^(#{1,6})\s*$/)
    if (hashMatch) {
      const newLevel = hashMatch[1].length
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, null, {
          ...this.node.attrs,
          level: newLevel,
          prefix: newPrefix,
        }),
      )
    }
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'heading') return false
    this.node = node
    this.dom.className = `src-heading src-heading-${node.attrs.level}`
    const expectedPrefix = node.attrs.prefix || defaultHeadingPrefix(node.attrs.level)
    if (this.prefixEl.textContent !== expectedPrefix) {
      this.prefixEl.textContent = expectedPrefix
    }
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.prefixEl.contains(mutation.target)
  }

  destroy(): void {
    this.prefixEl.removeEventListener('input', this.onPrefixInput)
  }
}

// ---------------------------------------------------------------------------
// BulletList NodeView
// ---------------------------------------------------------------------------

class BulletListSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  constructor(node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-bullet-list'
    this.dom.setAttribute('data-marker', node.attrs.marker || '-')

    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'src-list-content'
    this.dom.append(this.contentDOM)
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'bulletList') return false
    this.dom.setAttribute('data-marker', node.attrs.marker || '-')
    return true
  }

  ignoreMutation(): boolean {
    return false
  }
}

// ---------------------------------------------------------------------------
// OrderedList NodeView
// ---------------------------------------------------------------------------

class OrderedListSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  constructor(node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-ordered-list'
    this.dom.setAttribute('data-delimiter', node.attrs.delimiter || '.')
    this.dom.setAttribute('data-start', String(node.attrs.start || 1))

    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'src-list-content'
    this.dom.append(this.contentDOM)
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'orderedList') return false
    this.dom.setAttribute('data-delimiter', node.attrs.delimiter || '.')
    this.dom.setAttribute('data-start', String(node.attrs.start || 1))
    return true
  }

  ignoreMutation(): boolean {
    return false
  }
}

// ---------------------------------------------------------------------------
// ListItem NodeView
// ---------------------------------------------------------------------------

class ListItemSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private markerEl: HTMLElement

  constructor(_node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-list-item'

    // Marker prefix (e.g. "- " or "1. ")
    this.markerEl = document.createElement('span')
    this.markerEl.className = 'src-list-marker'
    this.markerEl.setAttribute('contenteditable', 'false')
    // Marker text is set via CSS ::before using parent's data-marker attribute

    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'src-list-item-content'

    this.dom.append(this.markerEl, this.contentDOM)
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'listItem') return false
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.markerEl.contains(mutation.target)
  }
}

// ---------------------------------------------------------------------------
// Blockquote NodeView
// ---------------------------------------------------------------------------

class BlockquoteSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  constructor(node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-blockquote'
    this.dom.setAttribute('data-marker', node.attrs.marker || '> ')

    this.contentDOM = document.createElement('div')
    this.contentDOM.className = 'src-blockquote-content'
    this.dom.append(this.contentDOM)
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'blockquote') return false
    this.dom.setAttribute('data-marker', node.attrs.marker || '> ')
    return true
  }

  ignoreMutation(): boolean {
    return false
  }
}

// ---------------------------------------------------------------------------
// CodeBlock NodeView
// ---------------------------------------------------------------------------

class CodeBlockSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openFence: HTMLElement
  private closeFence: HTMLElement

  constructor(node: PMNode, _view: EditorView, _getPos: () => number | undefined) {

    this.dom = document.createElement('div')
    this.dom.className = 'src-code-block'

    // Opening fence line (e.g. "```js")
    this.openFence = document.createElement('div')
    this.openFence.className = 'src-fence src-fence-open'
    this.openFence.setAttribute('contenteditable', 'false')
    this.openFence.textContent = (node.attrs.fence || '```') + (node.attrs.language || '')

    // Code content area (PM-managed)
    this.contentDOM = document.createElement('pre')
    this.contentDOM.className = 'src-code-content'

    // Closing fence line
    this.closeFence = document.createElement('div')
    this.closeFence.className = 'src-fence src-fence-close'
    this.closeFence.setAttribute('contenteditable', 'false')
    this.closeFence.textContent = node.attrs.fence || '```'

    this.dom.append(this.openFence, this.contentDOM, this.closeFence)
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'codeBlock') return false
    this.openFence.textContent = (node.attrs.fence || '```') + (node.attrs.language || '')
    this.closeFence.textContent = node.attrs.fence || '```'
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openFence.contains(mutation.target) ||
      this.closeFence.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// HorizontalRule NodeView
// ---------------------------------------------------------------------------

class HorizontalRuleSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM?: HTMLElement

  constructor(node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-hr'
    this.dom.setAttribute('contenteditable', 'false')
    this.dom.textContent = node.attrs.syntax || '---'
  }

  update(node: PMNode): boolean {
    if (node.type.name !== 'horizontalRule') return false
    this.dom.textContent = node.attrs.syntax || '---'
    return true
  }

  ignoreMutation(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------
// Paragraph NodeView (source mode — renders without any wrapper for clean look)
// ---------------------------------------------------------------------------

class ParagraphSourceNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement

  constructor(_node: PMNode, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-paragraph'

    this.contentDOM = this.dom
  }

  update(node: PMNode): boolean {
    return node.type.name === 'paragraph'
  }

  ignoreMutation(): boolean {
    return false
  }
}

// ---------------------------------------------------------------------------
// Export: NodeView constructor map for source mode
// ---------------------------------------------------------------------------

/**
 * Map of node type name → NodeView constructor for source mode.
 * Pass this to the raw PM EditorView's `nodeViews` option.
 */
export const sourceNodeViews: Record<string, NodeViewConstructor> = {
  heading: (node, view, getPos) =>
    new HeadingSourceNodeView(node, view, getPos as () => number | undefined),
  bulletList: (node, view, getPos) =>
    new BulletListSourceNodeView(node, view, getPos as () => number | undefined),
  orderedList: (node, view, getPos) =>
    new OrderedListSourceNodeView(node, view, getPos as () => number | undefined),
  listItem: (node, view, getPos) =>
    new ListItemSourceNodeView(node, view, getPos as () => number | undefined),
  blockquote: (node, view, getPos) =>
    new BlockquoteSourceNodeView(node, view, getPos as () => number | undefined),
  codeBlock: (node, view, getPos) =>
    new CodeBlockSourceNodeView(node, view, getPos as () => number | undefined),
  horizontalRule: (node, view, getPos) =>
    new HorizontalRuleSourceNodeView(node, view, getPos as () => number | undefined),
  paragraph: (node, view, getPos) =>
    new ParagraphSourceNodeView(node, view, getPos as () => number | undefined),
}
