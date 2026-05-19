# Unified Editor Architecture — Single PM Model

> Design document for replacing the dual-model editor (Tiptap + CM6) with a
> single ProseMirror document model that serves both WYSIWYG and Source modes.
>
> Status: **Planned** (post-plugin-system, new branch)

## Problem Statement

The current architecture uses two independent editor engines:

- **WYSIWYG mode**: Tiptap (ProseMirror)
- **Source mode**: CodeMirror 6

This creates:

1. **Two document models** — PM tree vs flat text, requiring conversion on mode switch
2. **Lossy cursor mapping** — line-level approximation only (character-level impossible)
3. **Separate undo stacks** — each mode has its own history, cross-mode undo is a single large step
4. **Content normalization** — opening a file through PM parse → serialize may change formatting
5. **Double dependency maintenance** — ~20 packages across two editor ecosystems
6. **Plugin complexity** — plugins need to handle two different editor implementations

## Solution: Single PM Instance + Format-Preserving Attrs

### Core Idea

One ProseMirror/Tiptap instance serves all three modes. Mode switching = CSS class toggle (show/hide syntax markers in NodeViews). No document conversion, no data loss.

### Key Design Decisions

1. **Schema stores original formatting in attrs**

   ```
   heading:    { level: 2, prefix: "## " }
   strong:     { delimiter: "**" }       (vs "__")
   emphasis:   { delimiter: "*" }        (vs "_")
   bullet_list: { marker: "-" }          (vs "+" or "*")
   code_block: { fence: "```", lang: "js" }  (vs "~~~")
   ```

2. **Custom parser: markdown-it tokens → PM doc directly (skip HTML)**

   Current pipeline (lossy):
   ```
   markdown text → markdown-it → HTML → PM DOMParser → PM doc
                                  ↑ format info lost here
   ```

   New pipeline (lossless):
   ```
   markdown text → markdown-it.parse() → token stream (has markup field)
                                            ↓
                              our code: tokens → PM nodes (preserving markup in attrs)
   ```

3. **Custom serializer: PM doc → markdown using attrs**

   ```
   heading node → output node.attrs.prefix + inline content + "\n"
   strong mark  → output node.attrs.delimiter + content + node.attrs.delimiter
   ```

4. **Single NodeView per node type, CSS-driven mode switching**

   ```html
   <div class="node-heading" data-level="2">
     <span class="syntax-marker">## </span>
     <span class="content">Hello World</span>  <!-- PM contentDOM -->
   </div>
   ```

   ```css
   .mode-wysiwyg .syntax-marker { display: none; }
   .mode-source .syntax-marker  { display: inline; color: var(--syntax-color); }
   .mode-source .node-heading   { font-family: monospace; font-size: 1em; }
   ```

   Mode switch = `container.className = 'mode-source'` — instant, zero conversion.

5. **Source mode editing via InputRule + Keymap (not free text editing)**

   - Typing regular text → normal PM text insertion (90% of edits)
   - `#` at line start → InputRule upgrades heading level
   - Backspace at content start → Keymap downgrades heading / removes mark
   - `**` around selection → InputRule wraps in strong
   - Tiptap already has most of these InputRules in StarterKit

6. **No CM6 dependency** — remove @codemirror/* packages entirely

### What We Don't Fork

| Library | Action |
|---------|--------|
| ProseMirror | Use as-is (via Tiptap) |
| Tiptap | Use as-is (extend via Extension API) |
| markdown-it | Use as-is (call .parse() only, not .render()) |
| tiptap-markdown | **Remove entirely**, replaced by our parser/serializer |

### What We Write

| Module | ~Lines | Purpose |
|--------|--------|---------|
| `MarkdownParser.ts` | 300-400 | markdown-it tokens → PM doc with format attrs |
| `MarkdownSerializer.ts` | 200-300 | PM doc → markdown text using attrs |
| Custom Extensions (heading, list, code_block, etc.) | 500-800 | Schema attrs + NodeViews with syntax markers |
| Source-mode CSS | 100 | Show/hide syntax markers per mode |
| InputRules + Keymaps | 200-300 | Structure editing in source mode |

Total: ~1500-2000 lines of new code.

### Benefits

| Benefit | Detail |
|---------|--------|
| Unified undo | One history stack across all modes |
| Unified cursor | Same PM position, no mapping needed |
| Zero-conversion mode switch | CSS toggle only, instant |
| No content normalization | attrs preserve original formatting |
| Fewer dependencies | Remove ~8 CM6 packages |
| Simpler plugin system | Plugins only adapt to one editor |
| Easier maintenance | Track one editor ecosystem |

### Trade-offs

| Trade-off | Mitigation |
|-----------|------------|
| Source mode isn't "free text editing" | InputRules cover common edits; use shortcuts for structure changes |
| Syntax markers not cursor-navigable | Users learn to use shortcuts (same as current WYSIWYG behavior) |
| Custom parser/serializer to maintain | ~600 lines total, straightforward logic |
| Some rare markdown constructs may not round-trip perfectly | Handle edge cases incrementally |

### Source Mode Editing Behavior

| User Action | PM Operation | Implementation |
|-------------|-------------|----------------|
| Type text in a heading | PM text insert | Native (cursor in contentDOM) |
| Type `#` at line start | Upgrade heading level | InputRule |
| Backspace at heading start | Downgrade heading level | Keymap |
| Select text, type `**` | Toggle strong mark | InputRule |
| Backspace into bold boundary | Remove strong mark | Keymap |
| Type `- ` at line start | Wrap in bullet list | InputRule (existing) |
| Enter in list item | Split list item | Existing Tiptap behavior |
| Type ``` at line start | Create code block | InputRule (existing) |

### Implementation Phases

| Phase | Tasks | Duration |
|-------|-------|----------|
| 1 | Schema redesign (add format attrs to all node types) | 2-3 days |
| 2 | Custom MarkdownParser (tokens → PM with attrs) | 3-5 days |
| 3 | Custom MarkdownSerializer (PM → markdown via attrs) | 2-3 days |
| 4 | NodeViews with syntax markers + CSS mode switching | 1-2 weeks |
| 5 | Mode switch logic (replace EditorManager mode system) | 2-3 days |
| 6 | InputRules + Keymaps for source-mode structure editing | 1 week |
| 7 | Edge cases, testing, polish | 1 week |
| **Total** | | **4-6 weeks** |

### Relationship to Plugin System

The plugin system (Phase 15) should be built FIRST on the current architecture. The
`IEditor` interface and `PluginContext` abstraction protect plugins from the underlying
editor implementation. When we later switch to the unified PM model:

- Plugin code: **zero changes** (they only see IEditor/PluginContext)
- PluginContext adapter layer: minor updates to reflect single editor
- `registerBlockRenderer` / `registerInlineRenderer`: still works (we control the rendering containers)

### Comparison with Alternatives

| Approach | Source Freedom | Unified Model | Normalization | Work |
|----------|---------------|---------------|---------------|------|
| Current (Tiptap + CM6) | Full | No | Yes (on switch) | 0 |
| All CM6 + Widgets (Obsidian) | Full | Yes | No | 2-3 months |
| Full Typora (cursor in syntax) | Full | Yes | No | 2-3 months |
| **This proposal (PM + CSS modes)** | Partial (via shortcuts) | Yes | No | 4-6 weeks |

### Open Questions

1. **Split mode rendering**: Left=source view, Right=WYSIWYG view of the SAME PM instance?
   Or just show the PM editor with mode-source CSS on left half?
2. **Tables in source mode**: Show as pipe syntax (complex NodeView) or show as visual table
   with a "view source" toggle?
3. **Large file performance**: NodeViews with syntax markers add DOM nodes — measure impact
   on documents with 1000+ lines.
4. **markdown-it token coverage**: Verify all CommonMark constructs produce tokens with
   sufficient information to reconstruct original formatting.

---

*This document will be updated as implementation progresses.*
