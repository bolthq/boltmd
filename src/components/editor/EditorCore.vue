<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions, WysiwygEditor, onLowlightReady, isLowlightLoaded } from '../../core/editor/WysiwygEditor'
import { registerEditor, unregisterEditor, registerTiptapEditor, unregisterTiptapEditor, reportCursorLine, reportActiveHeadingIndex, typewriterMode } from '../../core/editor/EditorManager'
import { imageService, isImageUrl } from '../../core/services/ImageService'
import { tryConvertTsvToTable, isSingleUrl, fetchPageTitle, tryWrapAsCodeBlock } from '../../core/services/SmartPasteService'
import { activeTab } from '../../core/stores/tabStore'
import type { IEditor } from '../../core/editor/types'

const props = defineProps<{
  content?: string
  active?: boolean
}>()

const emit = defineEmits<{
  change: [content: string]
}>()

let editorWrapper: IEditor | null = null

// Track the last content emitted by this editor so we can detect when a prop
// change is merely an echo of our own output (and skip the redundant setContent).
let lastEmittedContent = ''

// Whether the editor has been created (for v-show pattern: created once, stays alive).
let editorCreated = false

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
  content: props.content ?? '',
  onCreate({ editor }) {
    // Tiptap 创建完成后，包装为 IEditor 并注册
    editorWrapper = new WysiwygEditor(editor)
    editorWrapper.onContentChange((md) => {
      // Only emit changes when this editor is the active one.
      if (!props.active) return
      lastEmittedContent = md
      emit('change', md)
    })
    editorCreated = true

    // Only register if we're the active editor (v-show mode).
    if (props.active !== false) {
      registerEditor(editorWrapper)
      registerTiptapEditor(editor)
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

    // 预热 markdown 序列化器：首次 getMarkdown() 需要构建 nodes/marks 映射表，
    // 提前触发让 V8 JIT 优化这条代码路径，避免用户第一次按键时卡顿
    setTimeout(() => {
      try { (editor.storage as any).markdown?.getMarkdown() } catch { /* ignore */ }
    }, 0)
  },
  onSelectionUpdate({ editor }) {
    if (editorWrapper) {
      reportCursorLine(editorWrapper.getCursorPosition().line + 1)
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

      // 优先处理图片 blob（截图粘贴）
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

      // 检测粘贴的纯文本是否为图片 URL
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

// Content snapshot taken when this editor is deactivated.  Compared on
// reactivation to determine whether another mode actually modified content
// (avoids false positives from tiptap-markdown serialisation differences).
let contentWhenDeactivated: string | null = null

// 外部 content prop 变化时同步到编辑器
watch(() => props.content, (newContent) => {
  // Skip when editor is hidden (another mode is active). Content will be
  // synced when this editor becomes active again via the `active` watcher.
  if (!props.active) return
  // Skip during the transition from inactive→active (handled by active watcher
  // which records in history for proper undo support).
  if (!wasActive) return
  // Skip if this prop value matches what we last emitted (it's just our echo).
  if (newContent === lastEmittedContent) return
  if (newContent !== undefined && editorWrapper) {
    editorWrapper.setContent(newContent)
  }
})

// Watch active prop: register/unregister editor when shown/hidden.
watch(() => props.active, (isActive) => {
  if (!editorCreated || !editorWrapper || !tiptapEditor.value) return

  if (isActive) {
    // Becoming active: check whether content was modified while hidden.
    // Use the snapshot taken at deactivation to avoid false positives from
    // tiptap-markdown serialisation differences (trailing newlines, etc.).
    const contentReallyChanged =
      contentWhenDeactivated !== null
        ? props.content !== contentWhenDeactivated
        : props.content !== editorWrapper.getContent()
    contentWhenDeactivated = null

    if (contentReallyChanged && props.content !== undefined) {
      // Record in history so existing undo steps are preserved below this
      // replacement.  The user can Ctrl+Z past the mode-switch change and
      // continue undoing their own earlier edits.
      editorWrapper.setContent(props.content, true)
    }
    lastEmittedContent = editorWrapper.getContent()
    registerEditor(editorWrapper)
    registerTiptapEditor(tiptapEditor.value)
  } else {
    // Becoming inactive: snapshot current content for later comparison.
    contentWhenDeactivated = props.content ?? null
    // Becoming inactive: unregister so EditorManager doesn't route to us.
    unregisterEditor(editorWrapper)
    unregisterTiptapEditor()
  }

  wasActive = !!isActive
})

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
