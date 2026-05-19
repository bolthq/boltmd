# Unified Editor Architecture — Single PM Model

> Design document for replacing the dual-model editor (Tiptap + CM6) with a
> single ProseMirror document model. Source mode uses Tiptap extensions
> (NodeView/MarkView) with fully editable syntax markers.
>
> Status: **Planned** (post v1.0.0-beta, new branch)

---

## Problem Statement

The current architecture uses two independent editor engines:

- **WYSIWYG mode**: Tiptap (ProseMirror)
- **Source mode**: CodeMirror 6

This creates:

1. **Two document models** — PM tree vs flat text, requiring conversion on mode switch
2. **Lossy cursor mapping** — line-level approximation only (character-level impossible)
3. **Separate undo stacks** — each mode has its own history, cross-mode undo is a single large step
4. **Content normalization** — tiptap-markdown's `markdown → HTML → PM` pipeline loses original formatting
5. **Double dependency maintenance** — ~8 @codemirror packages (~550KB build output) + tiptap-markdown
6. **Plugin complexity** — plugins need to handle two different editor implementations
7. **Tab switch overhead** — current EditorManager saves/restores snapshots (serialize → destroy → rebuild)

### Why CM6 features are unnecessary for a Markdown editor

CM6 provides: line numbers, code folding, bracket matching, multi-cursor, code completion.
These are **code editor** features. A Markdown document editor doesn't need them:

- Line numbers: irrelevant for prose writing
- Code folding: not meaningful for markdown (headings + outline panel serve this purpose)
- Multi-cursor: niche for code, not prose (and was never used by real users in our analytics)
- Bracket matching / auto-complete: not applicable to markdown

Everything a markdown source editor needs (syntax highlighting, free text editing, keyboard
shortcuts) can be implemented with Tiptap's extension system.

---

## Solution Overview

### Core Principles

1. **One PM instance per tab** (EditorState holds doc + history + selection)
2. **Two shared EditorViews** (source view + WYSIWYG view), swap state on tab switch
3. **Mode switch = show/hide views** (CSS display toggle), zero document conversion
4. **WYSIWYG mode is completely unchanged** — current Tiptap rendering stays as-is
5. **Source mode uses MarkView/NodeView** with editable prefix/delimiter areas
6. **Every keystroke in source mode directly modifies the PM document tree**
7. **Format-preserving attrs** on nodes/marks record original markdown syntax

---

## Architecture

### Instance Model

```
Tab 1:  EditorState { doc, history, selection }
Tab 2:  EditorState { doc, history, selection }
Tab 3:  EditorState { doc, history, selection }
              ↓ active tab's state
    ┌─────────────────────────────────────────┐
    │  EditorView (source)                    │  ← raw PM EditorView, source NodeViews/MarkViews
    │  Tiptap Editor (wysiwyg)                │  ← standard Tiptap instance
    └─────────────────────────────────────────┘
    Both views operate on the same EditorState.
    Split mode = both views visible simultaneously.
```

**View layer implementation**:

- **WYSIWYG view**: A standard Tiptap `Editor` instance. We use its internal
  `editor.view` (a PM EditorView) and override `dispatchTransaction` to
  propagate state changes to the source view.
- **Source view**: A raw ProseMirror `EditorView` (not wrapped in Tiptap),
  created with the same schema and plugins as the WYSIWYG view. Uses custom
  NodeViews/MarkViews for source-mode rendering.

Both views must use **identical schema and plugins** (this is a PM requirement
for `updateState()` to work correctly across tab switches).

**Multi-view synchronization**:

PM does NOT automatically sync state between views. We implement a shared
dispatch function:

```typescript
function dispatchTransaction(tr: Transaction): void {
  // Apply transaction to get new state
  const newState = currentState.apply(tr)
  currentState = newState
  // Push new state to BOTH views
  sourceView.updateState(newState)
  wysiwygView.updateState(newState)
  // Store in tab's state reference
  tabs[currentTabId].state = newState
}
```

Both views' `dispatchTransaction` is set to this shared function.

**Tab switch**:
```typescript
function switchTab(newTabId: string): void {
  // Current state is already saved (updated on every dispatch)
  const newState = tabs[newTabId].state
  // updateState() requires same schema + plugins — guaranteed because
  // all tabs share the same extension configuration.
  sourceView.updateState(newState)
  wysiwygView.updateState(newState)
  currentTabId = newTabId
  currentState = newState
}
```

Zero serialization, zero parsing, instant switch. Each tab retains its own undo history
and cursor position.

### Mode Switch

```
Source only:     sourceView.style.display = 'block'   wysiwygView.style.display = 'none'
WYSIWYG only:   sourceView.style.display = 'none'    wysiwygView.style.display = 'block'
Split:           sourceView.style.display = 'block'   wysiwygView.style.display = 'block'
```

No document transformation. Both views read from the same EditorState.
Changes in one view trigger the shared `dispatchTransaction`, which updates
both views synchronously.

### Document Model

The PM document is a standard structured tree. Original markdown formatting is
preserved in **node attrs** and **mark attrs**:

```
heading:       { level: 2, prefix: "## " }
strong:        { delimiter: "**" }          // vs "__"
emphasis:      { delimiter: "*" }           // vs "_"
strikethrough: { delimiter: "~~" }
code:          { delimiter: "`" }           // vs "``"
bullet_list:   { marker: "-" }             // vs "+" or "*"
ordered_list:  { start: 1, delimiter: "." } // vs ")"
blockquote:    { marker: "> " }
code_block:    { fence: "```", lang: "js" } // vs "~~~"
hr:            { syntax: "---" }            // vs "***" or "___"
link:          { href, title }
image:         { src, alt, title }
```

WYSIWYG mode ignores these attrs (renders based on node type only).
Source mode reads these attrs to display the original syntax.

---

## Source Mode Rendering (Approach A: MarkView Editable Delimiters)

### Why This Approach

We evaluated multiple approaches for source mode inline mark editing:

| Approach | Source Editing | Data Safety | WYSIWYG Impact | Chosen |
|----------|---------------|-------------|----------------|--------|
| A: MarkView editable delimiter spans | Full (cursor in delimiters) | High (attrs are model-safe) | None | ✅ |
| B: Inline delimiter nodes in document | Full (native PM cursor) | Low (pairing can break) | Heavy (cursor-skip, command overhaul) | ✗ |
| C: Text client + diff back to PM | Full | Medium | None | ✗ |
| D: Decorations only (no edit) | Partial (shortcuts) | High | None | ✗ (fallback) |

**Approach A is chosen because**:

1. **Data integrity**: Delimiters are stored in mark/node attrs. PM's core operations
   (join, split, paste, undo, redo) preserve attrs automatically. The document model
   is always valid — no "delimiter-mark pairing" invariant to maintain.

2. **WYSIWYG stays untouched**: No hidden nodes, no cursor-skip plugins, no mark
   command overhaul. Standard Tiptap rendering works as-is.

3. **Complexity is at the VIEW layer**: MarkView/NodeView rendering and cursor handling.
   If rendering has a bug, the document is still intact (re-render fixes it). If
   delimiter nodes (Approach B) have a pairing bug, the document is silently corrupted.

4. **Single browser engine**: Tauri WebView2 = Chromium only. No cross-browser
   contenteditable inconsistencies. The cursor management in MarkView is reliable
   on a single engine.

### Block-Level Nodes (NodeView)

Each block node has a NodeView that renders differently based on mode:

```typescript
// HeadingNodeView (source mode)
class HeadingSourceNodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  prefixEl: HTMLElement  // editable prefix area

  constructor(node, view, getPos) {
    this.dom = document.createElement('div')
    this.dom.className = 'src-heading'

    // Editable prefix — NOT managed by PM
    this.prefixEl = document.createElement('span')
    this.prefixEl.className = 'prefix'
    this.prefixEl.contentEditable = 'true'
    this.prefixEl.textContent = node.attrs.prefix  // "## "

    // Content — managed by PM
    this.contentDOM = document.createElement('span')
    this.contentDOM.className = 'content'

    this.dom.append(this.prefixEl, this.contentDOM)

    // When user edits prefix, dispatch attr update
    this.prefixEl.addEventListener('input', () => {
      const newPrefix = this.prefixEl.textContent || ''
      const newLevel = (newPrefix.match(/^#+/) || [''])[0].length
      if (newLevel >= 1 && newLevel <= 6) {
        const pos = getPos()
        view.dispatch(view.state.tr.setNodeMarkup(pos, null, {
          ...node.attrs, prefix: newPrefix, level: newLevel
        }))
      }
    })
  }

  // Prevent PM from interfering with prefix edits
  ignoreMutation(mutation) {
    return this.prefixEl.contains(mutation.target)
  }
}
```

In WYSIWYG mode: standard Tiptap heading rendering (`<h2>content</h2>`), unchanged.

### Inline Marks (MarkView)

> **Implementation note**: Tiptap's MarkView support is relatively new.
> Before implementing Phase 5, we must verify on Tiptap 3.x that:
> (1) MarkView accepts `contentEditable` child elements alongside `contentDOM`,
> (2) `ignoreMutation` works correctly within MarkView to suppress PM interference,
> (3) nested marks render in the correct order (outer mark wraps inner mark).
> If MarkView proves insufficient, fallback is Approach D (Decorations for
> display-only delimiters + keyboard shortcuts to modify mark attrs).

Each mark type has a MarkView that in source mode renders editable delimiters:

```typescript
// StrongMarkView (source mode)
class StrongSourceMarkView {
  dom: HTMLElement
  contentDOM: HTMLElement
  openDelim: HTMLElement
  closeDelim: HTMLElement

  constructor(mark, view, inline) {
    this.dom = document.createElement('span')
    this.dom.className = 'src-strong'

    // Opening delimiter — editable, NOT in PM model
    this.openDelim = document.createElement('span')
    this.openDelim.className = 'delimiter'
    this.openDelim.contentEditable = 'true'
    this.openDelim.textContent = mark.attrs.delimiter  // "**"

    // Content — PM manages this
    this.contentDOM = document.createElement('span')

    // Closing delimiter — editable, NOT in PM model
    this.closeDelim = document.createElement('span')
    this.closeDelim.className = 'delimiter'
    this.closeDelim.contentEditable = 'true'
    this.closeDelim.textContent = mark.attrs.delimiter  // "**"

    this.dom.append(this.openDelim, this.contentDOM, this.closeDelim)

    // Handle delimiter edits
    this.openDelim.addEventListener('input', () => this.syncDelimiter(mark, view))
    this.closeDelim.addEventListener('input', () => this.syncDelimiter(mark, view))
  }

  syncDelimiter(mark, view) {
    // Read new delimiter text, update mark attrs via transaction
    const newDelim = this.openDelim.textContent || ''
    // ... dispatch tr to update mark attrs
  }

  ignoreMutation(mutation) {
    return this.openDelim.contains(mutation.target) ||
           this.closeDelim.contains(mutation.target)
  }
}
```

In WYSIWYG mode: standard Tiptap mark rendering (`<strong>content</strong>`), unchanged.

### Cursor Navigation Between Content and Delimiters

Since we only support WebView2 (Chromium), cursor behavior is predictable:

**Content → Delimiter** (pressing Left at start of marked content):
```typescript
// Custom keymap in source mode
handleKeyDown(view, event) {
  if (event.key === 'ArrowLeft') {
    const { from } = view.state.selection
    // If cursor is at start of a mark's content range,
    // focus the preceding delimiter span and set cursor to end
    const markBefore = getMarkDelimiterBefore(view, from)
    if (markBefore) {
      event.preventDefault()
      markBefore.delimEl.focus()
      setCursorToEnd(markBefore.delimEl)
      return true
    }
  }
}
```

**Delimiter → Content** (pressing Right at end of delimiter):
```typescript
// Event listener in MarkView's delimiter span
this.openDelim.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' && isCursorAtEnd(this.openDelim)) {
    e.preventDefault()
    // Return focus to PM and set selection to start of mark content
    view.focus()
    const pos = getMarkContentStart(...)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  }
})
```

This is ~40 lines of cursor bridging code total, contained within the MarkView.

---

## Custom Parser

### Pipeline

```
markdown text
    ↓ markdown-it.parse()
token stream (each token has .markup, .info, .nesting fields)
    ↓ our MarkdownParser.ts
PM document (nodes with format-preserving attrs)
```

### Why Skip HTML

Current tiptap-markdown pipeline:
```
markdown → markdown-it.render() → HTML string → PM DOMParser → PM doc
                                    ↑ format info lost here
```

The HTML intermediary loses:
- Whether bold used `**` or `__`
- Whether list used `-` or `*` or `+`
- Whether code fence used `` ``` `` or `~~~`
- Exact indentation and spacing

### markdown-it Token Availability

markdown-it's `.parse()` preserves everything we need in the token stream:

| Token | `.markup` field | What it tells us |
|-------|----------------|------------------|
| `heading_open` | `"##"` | Exact prefix (ATX style) |
| `strong_open` | `"**"` or `"__"` | Delimiter choice |
| `em_open` | `"*"` or `"_"` | Delimiter choice |
| `fence` | `` "```" `` or `"~~~"` | Fence style |
| `bullet_list_open` | (on list_item) `"-"` / `"*"` / `"+"` | Marker choice |
| `hr` | `"---"` / `"***"` / `"___"` | HR syntax |
| `code_inline` | `` "`" `` | Backtick count |

Our parser reads these fields and stores them as PM node/mark attrs.

### Estimated Size

~400 lines: token iteration + node/mark creation + attr population.

---

## Custom Serializer

### Pipeline

```
PM document tree
    ↓ walk nodes recursively
    ↓ for each node: output prefix (from attrs) + serialize children
    ↓ for each mark: output delimiter (from attrs) + content + delimiter
markdown text (byte-for-byte identical to original)
```

### Key Logic

```typescript
function serializeNode(node: PMNode): string {
  switch (node.type.name) {
    case 'heading':
      return node.attrs.prefix + serializeInline(node) + '\n\n'
    case 'paragraph':
      return serializeInline(node) + '\n\n'
    case 'code_block':
      return node.attrs.fence + node.attrs.lang + '\n' +
             node.textContent + '\n' +
             node.attrs.fence + '\n\n'
    case 'blockquote':
      return node.content.map(child =>
        node.attrs.marker + serializeNode(child)
      ).join('')
    // ...
  }
}

// Inline serialization tracks mark open/close boundaries across text nodes.
// PM splits text into nodes with uniform mark sets, so we compare adjacent
// nodes' marks to determine where delimiters open and close.
function serializeInline(node: PMNode): string {
  let result = ''
  let activeMarks: Mark[] = []

  node.forEach(child => {
    const newMarks = child.marks
    // Close marks no longer present (reverse order)
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      if (!activeMarks[i].isInSet(newMarks)) {
        result += getClosingDelimiter(activeMarks[i])
      }
    }
    // Open marks newly appearing
    for (const mark of newMarks) {
      if (!mark.isInSet(activeMarks)) {
        result += getOpeningDelimiter(mark)
      }
    }
    activeMarks = newMarks
    result += child.text || ''
  })

  // Close remaining open marks
  for (let i = activeMarks.length - 1; i >= 0; i--) {
    result += getClosingDelimiter(activeMarks[i])
  }
  return result
}
```

### Estimated Size

~300 lines: recursive tree walk + per-node-type output rules.

---

## What Gets Removed

| Package/Module | Size | Replaced By |
|----------------|------|-------------|
| @codemirror/view | ~150KB | Tiptap MarkView/NodeView |
| @codemirror/state | ~80KB | (same PM state) |
| @codemirror/language | ~60KB | Decoration-based syntax coloring |
| @codemirror/lang-markdown | ~40KB | (not needed) |
| @codemirror/language-data | ~200KB | (not needed) |
| @codemirror/commands | ~20KB | Tiptap keymaps |
| @codemirror/search | ~15KB | Existing find/replace (Tiptap-based) |
| @lezer/* (parser) | ~50KB | (not needed) |
| tiptap-markdown | ~30KB | Custom parser + serializer |
| SourceEditor.ts | ~400 lines | Removed |
| SplitView.vue | ~200 lines | Simplified (two views, one state) |
| EditorManager snapshot logic | ~300 lines | Direct state swap |

**Total reduction**: ~650KB build output, ~900 lines of glue code.

---

## What We Write

| Module | ~Lines | Purpose |
|--------|--------|---------|
| `MarkdownParser.ts` | 400 | markdown-it tokens → PM doc with format attrs |
| `MarkdownSerializer.ts` | 300 | PM doc → markdown text using attrs |
| Source-mode NodeViews (heading, list, blockquote, code_block, hr) | 400 | Editable prefix + contentDOM |
| Source-mode MarkViews (strong, em, code, strikethrough, link) | 300 | Editable delimiter spans |
| Cursor bridging keymaps | 50 | Arrow key navigation between content and delimiter areas |
| Source-mode CSS | 80 | Monospace font, syntax coloring, layout |
| EditorManager refactor | 200 | Dual-view management, state-per-tab |

**Total new code**: ~1700 lines.

---

## Detailed Behavior

### Source Mode Editing

Every keystroke in source mode modifies the PM document tree:

| User Action | What Happens | PM Operation |
|-------------|--------------|--------------|
| Type text in heading content | Native PM text insert | Transaction: insert text |
| Type in heading prefix (`## ` → `### `) | NodeView input handler fires | Transaction: setNodeMarkup(level=3, prefix="### ") |
| Type in bold delimiter (`**` → `__`) | MarkView input handler fires | Transaction: update mark attrs |
| Type `**` in plain text | InputRule detects pattern | Transaction: add strong mark |
| Backspace at start of heading content | Keymap intercepts | Transaction: downgrade heading / convert to paragraph |
| Enter inside a list item | Standard Tiptap behavior | Transaction: split list item |
| Delete text that removes a mark entirely | PM native mark removal | Transaction: remove mark (attrs preserved until re-applied) |

### WYSIWYG Mode Editing

**Completely unchanged from current implementation.** Same Tiptap extensions, same
rendering, same InputRules, same keyboard shortcuts. The only addition: when marks
are created (e.g., Ctrl+B), the mark gets default attrs (`delimiter: "**"`).

### Split Mode

- Left panel: source EditorView (source NodeViews/MarkViews)
- Right panel: WYSIWYG EditorView (standard Tiptap NodeViews)
- Both share one EditorState from the active tab
- Edit in either panel → shared `dispatchTransaction` updates both views
- Scroll sync: map scroll position between views using PM document positions

---

## Nested/Overlapping Marks

For `**bold *italic* bold**`:

PM document:
```
text("bold ", marks: [strong])
text("italic", marks: [strong, em])
text(" bold", marks: [strong])
```

PM renders marks as nested DOM (outer → inner):
```
strong MarkView:
  delimiter: "**"
  content:
    text("bold ")
    em MarkView:
      delimiter: "*"
      content: text("italic")
    text(" bold")
  delimiter: "**"
```

Visual output in source mode: `**bold *italic* bold**` — naturally correct
due to mark nesting.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Cursor navigation at delimiter boundaries feels janky | Medium | Contained to ~50 lines of keymap code; only Chromium to support |
| Mark delimiter editing produces invalid state (e.g., user empties `**`) | Low | Validate in input handler; reject or remove mark if delimiter is invalid |
| markdown-it tokens lack info for rare constructs | Low | Handle incrementally; start with CommonMark core |
| Performance with many MarkViews on large files | Low | Benchmark; lazy render offscreen marks if needed |
| Whitespace/newline sensitivity | Medium | Configure PM schema with whitespace preservation where needed |

---

## Open Questions (To Resolve During Implementation)

1. **Tables in source mode**: Render as pipe syntax (complex NodeView with per-cell editing)
   or show as visual table with a "raw" toggle?

2. **Setext headings** (`===` / `---` underline style): Support in parser? Or normalize
   to ATX (`##`) on import? Recommendation: normalize to ATX (simpler, widely preferred).

3. **Reference-style links** (`[text][id]` + `[id]: url`): Store in attrs and reconstruct?
   Or normalize to inline `[text](url)`? Recommendation: normalize for v1, support later.

4. **Large file optimization**: If a document has 500+ inline marks, each with MarkView
   + 2 delimiter spans, measure DOM node count and rendering performance.

5. **Collaboration readiness**: With one PM state, adding real-time collab (Yjs) in the
   future is straightforward. Verify that custom attrs don't interfere with Yjs sync.

---

## Implementation Phases

| Phase | Tasks | Estimate |
|-------|-------|----------|
| 1 | Schema redesign: add format attrs to all node/mark types, set defaults | 2 days |
| 2 | Custom MarkdownParser (markdown-it tokens → PM doc with attrs) | 4 days |
| 3 | Custom MarkdownSerializer (PM doc → markdown via attrs) + round-trip tests | 2 days |
| 4 | EditorManager refactor (state-per-tab, dual-view, shared dispatch, mode toggle) | 3 days |
| 5 | Source-mode NodeViews (heading, list, blockquote, code_block, hr) | 3 days |
| 6 | Source-mode MarkViews (strong, em, code, strikethrough, link) — verify MarkView feasibility first | 5 days |
| 7 | Cursor bridging keymaps (content ↔ delimiter navigation) | 2 days |
| 8 | Source-mode CSS + syntax highlighting (Decorations) | 2 days |
| 9 | Remove CM6 + tiptap-markdown, update all imports/configs | 1 day |
| 10 | Split mode (dual EditorView visible, scroll sync) | 2 days |
| 11 | Edge cases, testing, polish | 5 days |
| **Total** | | **~30 days (5-6 weeks)** |

> **Note on ordering**: Phase 4 (EditorManager) must come before Phases 5-6
> because source-mode NodeViews/MarkViews need the dual-view infrastructure
> to be testable. Phase 9 (remove CM6) comes after the new source mode is
> fully functional, acting as the final cutover.

---

## Relationship to Current Systems

### Plugin System

The plugin system (`IEditor` interface + `PluginContext`) abstracts the editor.
After this refactor:

- Plugin code: **zero changes** (plugins interact via IEditor, never with CM6 directly)
- PluginContext: minor adapter update (one editor instead of mode-conditional logic)
- Editor events (`EditorContentChange`, `EditorModeChange`): still emitted

### IEditor Interface

The `IEditor` interface currently has implementations for both Tiptap and CM6.
After refactor: single implementation backed by the unified PM instance.
Methods like `getContent()`, `setContent()`, `focus()`, `jumpToHeading()` all
route to the same PM state.

### Find & Replace

Currently handled differently per editor engine. After refactor: single implementation
using PM's search/decoration API. Simpler and more consistent.

### Auto-Save

Works on serialized markdown content. After refactor: `serializer.serialize(state.doc)`
produces markdown text for saving. No behavior change from user perspective.

---

## Summary of Key Decisions

1. **Approach A (MarkView editable delimiters)** chosen over inline delimiter nodes
   — complexity at view layer is safer than complexity at model layer.

2. **One EditorState per tab** — independent undo/cursor per file.

3. **Two shared EditorViews** — memory efficient, instant tab switch via `updateState()`.

4. **WYSIWYG mode unchanged** — zero risk to existing functionality.

5. **Source mode = full free editing** — cursor can enter and edit syntax markers
   (prefix, delimiters) directly. Every edit modifies the PM doc tree.

6. **Custom parser/serializer** replaces tiptap-markdown — lossless round-trip via
   format-preserving attrs.

7. **No CM6 features needed** — line numbers, folding, multi-cursor are code editor
   features irrelevant to markdown editing. Tiptap extensions cover all needs.

---

*This document reflects the final design decisions from architecture discussions.
Implementation should follow the phases above on a separate branch.*
