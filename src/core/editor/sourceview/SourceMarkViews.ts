/**
 * Source-mode MarkViews — Inline mark rendering for source editing mode.
 *
 * Each MarkView renders the mark's delimiters (e.g. ** for bold, * for italic)
 * as visible, editable spans around PM's content area. Users can see and
 * navigate into the delimiter characters in source mode.
 *
 * These MarkViews are registered on the raw PM EditorView used in source mode.
 * The WYSIWYG Tiptap Editor uses standard rendering and never sees these.
 *
 * NOTE: MarkView support in Tiptap 3.x / PM requires verification.
 * If MarkView proves insufficient, this module provides the implementation
 * that can be adapted to use Decorations as a fallback (Approach D).
 */

import type { Mark } from '@tiptap/pm/model'
import type { EditorView, MarkView, MarkViewConstructor, ViewMutationRecord } from '@tiptap/pm/view'

// ---------------------------------------------------------------------------
// Strong (Bold) MarkView
// ---------------------------------------------------------------------------

class StrongSourceMarkView implements MarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openDelim: HTMLElement
  private closeDelim: HTMLElement

  constructor(mark: Mark, _view: EditorView, _inline: boolean) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-strong'

    const delimiter = mark.attrs.delimiter || '**'

    // Opening delimiter
    this.openDelim = document.createElement('span')
    this.openDelim.className = 'src-delimiter src-delimiter-open'
    this.openDelim.textContent = delimiter

    // PM-managed content
    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'src-mark-content'

    // Closing delimiter
    this.closeDelim = document.createElement('span')
    this.closeDelim.className = 'src-delimiter src-delimiter-close'
    this.closeDelim.textContent = delimiter

    this.dom.append(this.openDelim, this.contentDOM, this.closeDelim)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openDelim.contains(mutation.target) ||
      this.closeDelim.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// Emphasis (Italic) MarkView
// ---------------------------------------------------------------------------

class EmSourceMarkView implements MarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openDelim: HTMLElement
  private closeDelim: HTMLElement

  constructor(mark: Mark, _view: EditorView, _inline: boolean) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-em'

    const delimiter = mark.attrs.delimiter || '*'

    this.openDelim = document.createElement('span')
    this.openDelim.className = 'src-delimiter src-delimiter-open'
    this.openDelim.textContent = delimiter

    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'src-mark-content'

    this.closeDelim = document.createElement('span')
    this.closeDelim.className = 'src-delimiter src-delimiter-close'
    this.closeDelim.textContent = delimiter

    this.dom.append(this.openDelim, this.contentDOM, this.closeDelim)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openDelim.contains(mutation.target) ||
      this.closeDelim.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// Strikethrough MarkView
// ---------------------------------------------------------------------------

class StrikeSourceMarkView implements MarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openDelim: HTMLElement
  private closeDelim: HTMLElement

  constructor(mark: Mark, _view: EditorView, _inline: boolean) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-strike'

    const delimiter = mark.attrs.delimiter || '~~'

    this.openDelim = document.createElement('span')
    this.openDelim.className = 'src-delimiter src-delimiter-open'
    this.openDelim.textContent = delimiter

    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'src-mark-content'

    this.closeDelim = document.createElement('span')
    this.closeDelim.className = 'src-delimiter src-delimiter-close'
    this.closeDelim.textContent = delimiter

    this.dom.append(this.openDelim, this.contentDOM, this.closeDelim)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openDelim.contains(mutation.target) ||
      this.closeDelim.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// Inline Code MarkView
// ---------------------------------------------------------------------------

class CodeSourceMarkView implements MarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openDelim: HTMLElement
  private closeDelim: HTMLElement

  constructor(mark: Mark, _view: EditorView, _inline: boolean) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-code'

    const delimiter = mark.attrs.delimiter || '`'

    this.openDelim = document.createElement('span')
    this.openDelim.className = 'src-delimiter src-delimiter-open'
    this.openDelim.textContent = delimiter

    this.contentDOM = document.createElement('code')
    this.contentDOM.className = 'src-mark-content'

    this.closeDelim = document.createElement('span')
    this.closeDelim.className = 'src-delimiter src-delimiter-close'
    this.closeDelim.textContent = delimiter

    this.dom.append(this.openDelim, this.contentDOM, this.closeDelim)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openDelim.contains(mutation.target) ||
      this.closeDelim.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// Link MarkView
// ---------------------------------------------------------------------------

class LinkSourceMarkView implements MarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private openBracket: HTMLElement
  private closePart: HTMLElement

  constructor(mark: Mark, _view: EditorView, _inline: boolean) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-link'

    const href = mark.attrs.href || ''
    const title = mark.attrs.title

    // Opening bracket: [
    this.openBracket = document.createElement('span')
    this.openBracket.className = 'src-delimiter src-link-open'
    this.openBracket.textContent = '['

    // PM-managed content (link text)
    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'src-mark-content'

    // Closing part: ](url) or ](url "title")
    this.closePart = document.createElement('span')
    this.closePart.className = 'src-delimiter src-link-close'
    if (title) {
      this.closePart.textContent = `](${href} "${title}")`
    } else {
      this.closePart.textContent = `](${href})`
    }

    this.dom.append(this.openBracket, this.contentDOM, this.closePart)
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return (
      this.openBracket.contains(mutation.target) ||
      this.closePart.contains(mutation.target)
    )
  }
}

// ---------------------------------------------------------------------------
// Export: MarkView constructor map for source mode
// ---------------------------------------------------------------------------

/**
 * Map of mark type name → MarkView constructor for source mode.
 * Pass this to the raw PM EditorView's `markViews` option.
 */
export const sourceMarkViews: Record<string, MarkViewConstructor> = {
  bold: (mark, view, inline) => new StrongSourceMarkView(mark, view, inline),
  italic: (mark, view, inline) => new EmSourceMarkView(mark, view, inline),
  strike: (mark, view, inline) => new StrikeSourceMarkView(mark, view, inline),
  code: (mark, view, inline) => new CodeSourceMarkView(mark, view, inline),
  link: (mark, view, inline) => new LinkSourceMarkView(mark, view, inline),
}
