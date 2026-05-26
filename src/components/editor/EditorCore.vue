<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions, WysiwygEditor, onLowlightReady, isLowlightLoaded } from '../../core/editor/WysiwygEditor'
import { registerEditor, unregisterEditor, registerTiptapEditor, unregisterTiptapEditor, reportCursorLine, reportActiveHeadingIndex, typewriterMode } from '../../core/editor/EditorManager'
import { serializeMarkdown } from '../../core/editor/serializer/MarkdownSerializer'
import { imageService, isImageUrl } from '../../core/services/ImageService'
import { tryConvertTsvToTable, isSingleUrl, fetchPageTitle, tryWrapAsCodeBlock } from '../../core/services/SmartPasteService'
import { activeTab } from '../../core/stores/tabStore'
import type { IEditor } from '../../core/editor/types'

const props = defineProps<{
  content?: string
  /** When true, this editor is the active IEditor for EditorManager (WYSIWYG mode).
   *  When false, it's still alive (canonical doc tree) but not the user-facing editor. */
  active?: boolean
  /** When true, the view is read-only (used in split mode right pane). */
  readonly?: boolean
}>()

const emit = defineEmits<{
  change: [content: string]
  /** Emitted after the editor first processes content, providing the serialized
   *  (normalized) form. Used to update cleanContent so that format-only changes
   *  from the parse→serialize round-trip don't cause permanent dirty flags. */
  normalize: [content: string]
}>()

let editorWrapper: IEditor | null = null

// Track the last content emitted by this editor so we can detect when a prop
// change is merely an echo of our own output (and skip the redundant setContent).
let lastEmittedContent = ''

// Whether the editor has been created (for v-show pattern: created once, stays alive).
let editorCreated = false

/**
 * Emit 'normalize' if the current serialized content differs from props.content.
 * Called after setContent to keep cleanContent aligned with the parse→serialize output.
 */
function emitNormalize(): void {
  if (!tiptapEditor.value) return
  const normalized = serializeMarkdown(tiptapEditor.value.state.doc)
  if (normalized !== props.content) {
    emit('normalize', normalized)
  }
}

/**
 * Helper for typewriter-mode scroll props.
 * Returns ~45% of the .editor-mount visible height so PM's scrollRectIntoView
 * keeps the caret near the vertical center.
 */
function editorMountHalfHeight(): number {
  const el = document.querySelector('.editor-mount') as HTMLElement
  return el ? el.clientHeight * 0.45 : 300
}

// Typewriter mode: dynamic scrollThreshold / scrollMargin objects with getters
// so ProseMirror re-evaluates them on every scroll-into-view call.
const typewriterScrollThreshold = {
  get top() { return typewriterMode.value ? 10000 : 0 },
  get bottom() { return typewriterMode.value ? 10000 : 0 },
  left: 0,
  right: 0,
}
const typewriterScrollMargin = {
  get top() { return typewriterMode.value ? editorMountHalfHeight() : 5 },
  get bottom() { return typewriterMode.value ? editorMountHalfHeight() : 5 },
  left: 5,
  right: 5,
}

const tiptapEditor = useEditor({
  extensions: createWysiwygExtensions(),
  content: '',
  onCreate({ editor }) {
    // Tiptap 创建完成后，包装为 IEditor 并注册
    editorWrapper = new WysiwygEditor(editor)

    // Set initial content using our custom parser (NOT tiptap-markdown's internal
    // parser) so that htmlBlock nodes and format-preserving attrs are handled correctly.
    if (props.content) {
      editorWrapper.setContent(props.content)
    }

    editorWrapper.onContentChange((md) => {
      // Only emit changes when this editor is the active IEditor.
      if (!props.active) return
      lastEmittedContent = md
      emit('change', md)
    })
    editorCreated = true

    // Always register the Tiptap Editor so PMSourceEditor can dispatch to it
    // via getTiptapEditor(). This is the canonical document tree.
    registerTiptapEditor(editor)

    // Only register as active IEditor if we're in WYSIWYG mode.
    if (props.active !== false) {
      registerEditor(editorWrapper)
    }

    // When lowlight finishes lazy-loading, force CodeBlockLowlight to
    // recompute syntax highlighting by touching every codeBlock node.
    // Skip if lowlight was already loaded before editor creation (no-op).
    if (!isLowlightLoaded()) {
      onLowlightReady(() => {
        if (editor.isDestroyed) return
        const { tr } = editor.state
        let modified = false
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'codeBlock') {
            tr.setNodeMarkup(pos, undefined, node.attrs)
            modified = true
          }
        })
        if (modified) {
          tr.setMeta('addToHistory', false)
          editor.view.dispatch(tr)
        }
      })
    }

    // Warm up markdown serializer: first getMarkdown() builds nodes/marks mappings,
    // trigger early so V8 JIT optimizes the code path before the user's first keystroke.
    setTimeout(() => {
      try { (editor.storage as any).markdown?.getMarkdown() } catch { /* ignore */ }
    }, 0)

    // Emit normalized content so cleanContent can be updated to match the
    // serialized form. This prevents format-only normalization differences
    // (e.g. blank line insertion between blocks) from causing a permanent dirty flag.
    if (props.active) {
      const normalized = serializeMarkdown(editor.state.doc)
      if (normalized !== props.content) {
        emit('normalize', normalized)
      }
    }

    // Apply initial readonly state (watcher's immediate fires before editor exists).
    if (props.readonly) {
      editor.setEditable(false)
    }
  },
  onSelectionUpdate({ editor }) {
    // Only report cursor/heading when this is the active IEditor (WYSIWYG mode).
    if (!props.active) return
    if (editorWrapper) {
      reportCursorLine(editorWrapper.getCursorPosition().line)
    }
    // Compute which heading the cursor is within by counting heading nodes
    // that appear before the current selection position.
    const pos = editor.state.selection.from
    let headingIdx = -1
    editor.state.doc.descendants((node, nodePos) => {
      if (nodePos >= pos) return false
      if (node.type.name === 'heading') {
        headingIdx++
      }
      return true
    })
    reportActiveHeadingIndex(headingIdx)
  },
  editorProps: {
    attributes: {
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    },
    // Typewriter mode: use large scrollThreshold + scrollMargin so PM's own
    // scrollRectIntoView keeps the cursor near the vertical center.
    scrollThreshold: typewriterScrollThreshold,
    scrollMargin: typewriterScrollMargin,
    handlePaste(_view, event) {
      const items = event.clipboardData?.items
      if (!items) return false

      // Handle image blob paste (screenshots)
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const blob = item.getAsFile()
          if (!blob) return true
          const filePath = activeTab.value?.filePath ?? null
          imageService.handlePasteImage(blob, filePath).then((src) => {
            if (src && tiptapEditor.value) {
              tiptapEditor.value.chain().focus().setImage({ src }).run()
            }
          })
          return true
        }
      }

      // Detect if pasted plain text is an image URL
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (isImageUrl(text)) {
        event.preventDefault()
        tiptapEditor.value?.chain().focus().setImage({ src: text.trim() }).run()
        return true
      }

      // Smart paste: single URL → insert as link with fetched title.
      if (isSingleUrl(text)) {
        event.preventDefault()
        const url = text.trim()
        const ed = tiptapEditor.value
        if (!ed) return true
        // Insert the bare URL as text immediately.
        ed.chain().focus().insertContent(url).run()
        // Record the position right after insertion for async replacement.
        const insertEnd = ed.state.selection.from
        const insertStart = insertEnd - url.length
        // Async: fetch title and replace with markdown link.
        fetchPageTitle(url).then((title) => {
          if (!title || !tiptapEditor.value) return
          const editor = tiptapEditor.value
          // Verify the text at the recorded position still matches.
          const { doc } = editor.state
          const slice = doc.textBetween(insertStart, insertEnd, '')
          if (slice === url) {
            // Replace with markdown link text — tiptap-markdown will parse it.
            editor.chain()
              .setTextSelection({ from: insertStart, to: insertEnd })
              .insertContent(`[${title}](${url})`)
              .run()
          }
        })
        return true
      }

      // Smart paste: TSV (Excel/Sheets) → Markdown table
      const table = tryConvertTsvToTable(text)
      if (table) {
        event.preventDefault()
        tiptapEditor.value?.commands.insertContent(table)
        return true
      }

      // Smart paste: code detection → fenced code block
      const codeBlock = tryWrapAsCodeBlock(text)
      if (codeBlock) {
        event.preventDefault()
        tiptapEditor.value?.commands.insertContent(codeBlock)
        return true
      }

      return false
    },
    handleDrop(_view, event) {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return false

      const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
      if (!imageFile) return false

      event.preventDefault()
      const filePath = activeTab.value?.filePath ?? null
      imageService.handleDropImage(imageFile, filePath).then((src) => {
        if (src && tiptapEditor.value) {
          tiptapEditor.value.chain().focus().setImage({ src }).run()
        }
      })
      return true
    },
  },
})

// Whether this editor was active on the PREVIOUS render cycle. Used to
// detect the inactive→active transition and defer to the active watcher.
let wasActive = props.active !== false

// Sync content from prop when it changes externally (e.g. tab switch, file reload).
watch(() => props.content, (newContent) => {
  // Skip when this editor is not the active IEditor. Content will be
  // synced via docTransfer when this editor becomes active again.
  if (!props.active) return
  // Skip during the transition from inactive→active (handled by active watcher).
  if (!wasActive) return
  // Skip if this prop value matches what we last emitted (it's just our echo).
  if (newContent === lastEmittedContent) return
  if (newContent !== undefined && editorWrapper) {
    editorWrapper.setContent(newContent)
  }
})

// Watch active prop: register/unregister IEditor when this becomes WYSIWYG active/inactive.
// NOTE: Tiptap Editor stays registered always (it's the canonical doc tree).
watch(() => props.active, (isActive) => {
  if (!editorCreated || !editorWrapper || !tiptapEditor.value) return

  if (isActive) {
    // When becoming active after a tab switch, ensure the editor content matches
    // props.content. This handles the case where content.value was updated by
    // restoreFromSnapshot while this editor was inactive (props.active=false),
    // causing the content watcher to skip the update.
    // Skip if there's a pending docTransfer (mode switch from source) since
    // registerEditor will handle that via setDocTransfer.
    if (props.content !== undefined && !wasActive) {
      const currentMd = editorWrapper.getContent()
      if (currentMd !== props.content) {
        editorWrapper.setContent(props.content)
        // Clear undo history: content mismatch means this is a tab switch
        // (not a mode switch where content stays in sync via syncToCanonical).
        editorWrapper.resetForTabSwitch?.()
        emitNormalize()
      }
    }
    lastEmittedContent = editorWrapper.getContent()
    // registerEditor will handle pendingDocTransfer if available (direct doc
    // transfer from source mode).
    registerEditor(editorWrapper)
  } else {
    // Becoming inactive: unregister IEditor so EditorManager doesn't route to us.
    unregisterEditor(editorWrapper)
  }

  wasActive = !!isActive
})

// Watch readonly prop: toggle editability on the Tiptap editor.
watch(() => props.readonly, (isReadonly) => {
  if (tiptapEditor.value) {
    tiptapEditor.value.setEditable(!isReadonly)
  }
}, { immediate: true })

onUnmounted(() => {
  if (editorWrapper) {
    unregisterEditor(editorWrapper)
    editorWrapper = null
  }
  unregisterTiptapEditor()
  tiptapEditor.value?.destroy()
})
</script>

<template>
  <div class="editor-core">
    <EditorContent class="editor-mount" :editor="tiptapEditor" />
  </div>
</template>
