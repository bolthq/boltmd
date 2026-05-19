/**
 * FormatAttrs — Format-preserving attributes for the unified editor architecture.
 *
 * Extends existing Tiptap node/mark types with attributes that record the
 * original Markdown syntax used by the author (e.g. `**` vs `__` for bold,
 * `-` vs `*` for bullet lists).
 *
 * These attrs are:
 * - Populated by the custom MarkdownParser (Phase 2)
 * - Read by the custom MarkdownSerializer (Phase 3) for lossless round-trip
 * - Read by source-mode NodeViews/MarkViews (Phases 5-6) to render syntax
 * - Ignored by WYSIWYG mode (renders based on node/mark type only)
 *
 * All attrs have sensible defaults so existing functionality is unaffected.
 * Adding attrs with defaults is transparent to all PM operations (join, split,
 * paste, undo, redo) — they preserve attrs automatically.
 */

import Heading from '@tiptap/extension-heading'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import Blockquote from '@tiptap/extension-blockquote'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

// ---------------------------------------------------------------------------
// Node extensions with format-preserving attrs
// ---------------------------------------------------------------------------

/**
 * Heading with `prefix` attr.
 * Stores the exact ATX prefix string (e.g. "## " for level 2).
 * Default is null — when null, the serializer derives from level.
 */
export const FormatHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      prefix: {
        default: null,
        renderHTML: () => ({}),
        parseHTML: () => null,
      },
    }
  },
})

/**
 * BulletList with `marker` attr.
 * Stores the list marker character (-, *, +).
 */
export const FormatBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: {
        default: '-',
        renderHTML: () => ({}),
        parseHTML: () => '-',
      },
    }
  },
})

/**
 * OrderedList with `delimiter` attr.
 * Stores the delimiter after the number (. or )).
 */
export const FormatOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '.',
        renderHTML: () => ({}),
        parseHTML: () => '.',
      },
    }
  },
})

/**
 * Blockquote with `marker` attr.
 * Stores the quote marker (typically "> ").
 */
export const FormatBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      marker: {
        default: '> ',
        renderHTML: () => ({}),
        parseHTML: () => '> ',
      },
    }
  },
})

/**
 * HorizontalRule with `syntax` attr.
 * Stores the exact HR syntax (---, ***, ___).
 */
export const FormatHorizontalRule = HorizontalRule.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      syntax: {
        default: '---',
        renderHTML: () => ({}),
        parseHTML: () => '---',
      },
    }
  },
})

// ---------------------------------------------------------------------------
// Mark extensions with format-preserving attrs
// ---------------------------------------------------------------------------

/**
 * Bold/Strong with `delimiter` attr.
 * Stores ** or __.
 */
export const FormatBold = Bold.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '**',
        renderHTML: () => ({}),
        parseHTML: () => '**',
      },
    }
  },
})

/**
 * Italic/Emphasis with `delimiter` attr.
 * Stores * or _.
 */
export const FormatItalic = Italic.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '*',
        renderHTML: () => ({}),
        parseHTML: () => '*',
      },
    }
  },
})

/**
 * Strikethrough with `delimiter` attr.
 * Stores ~~ (standard GFM strikethrough).
 */
export const FormatStrike = Strike.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '~~',
        renderHTML: () => ({}),
        parseHTML: () => '~~',
      },
    }
  },
})

/**
 * Inline code with `delimiter` attr.
 * Stores the backtick sequence (` or `` etc.).
 */
export const FormatCode = Code.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      delimiter: {
        default: '`',
        renderHTML: () => ({}),
        parseHTML: () => '`',
      },
    }
  },
})

// ---------------------------------------------------------------------------
// Helper: get the prefix string for a heading level
// ---------------------------------------------------------------------------

/**
 * Generate the default heading prefix for a given level.
 * e.g. level 2 → "## "
 */
export function defaultHeadingPrefix(level: number): string {
  return '#'.repeat(level) + ' '
}
