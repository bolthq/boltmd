<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SourceEditor, type PasteHandler } from '../../core/editor/SourceEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'
import { imageService, isImageUrl } from '../../core/services/ImageService'
import { tryConvertClipboardHtml, tryConvertTsvToTable, isSingleUrl, fetchPageTitle, buildMarkdownLink, tryWrapAsCodeBlock } from '../../core/services/SmartPasteService'
import { activeTab } from '../../core/stores/tabStore'

const props = defineProps<{
  content?: string
  /** 为 true 时不注册到 EditorManager（SplitView 内嵌时使用） */
  noRegister?: boolean
}>()

const emit = defineEmits<{
  change: [content: string]
  scroll: [scrollTop: number, scrollHeight: number, clientHeight: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: SourceEditor | null = null
let scrollEl: HTMLElement | null = null

function handleScroll() {
  if (!scrollEl) return
  emit('scroll', scrollEl.scrollTop, scrollEl.scrollHeight, scrollEl.clientHeight)
}

/**
 * Smart paste handler — runs inside CM6's event system via domEventHandlers.
 * Return true to prevent CM6's default paste, false to let CM6 handle it.
 */
const pasteHandler: PasteHandler = (event, ed) => {
  const items = event.clipboardData?.items
  if (!items) return false

  // Handle image blob (screenshot paste).
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (!blob) return true
      const filePath = activeTab.value?.filePath ?? null
      imageService.handlePasteImage(blob, filePath).then((src) => {
        if (src && editor) {
          editor.insertText(`![](${src})`)
        }
      })
      return true
    }
  }

  // Check if pasted text is an image URL.
  const text = event.clipboardData?.getData('text/plain') ?? ''
  if (isImageUrl(text)) {
    ed.insertText(`![](${text.trim()})`)
    return true
  }

  // Smart paste: single URL → [title](url)
  if (isSingleUrl(text)) {
    const url = text.trim()
    // Insert the bare URL immediately as placeholder.
    const insertFrom = ed.getCursorOffset()
    ed.insertText(url)
    const insertTo = insertFrom + url.length
    // Async: fetch title and replace the bare URL with [title](url).
    fetchPageTitle(url).then((title) => {
      if (!title || !editor) return
      const mdLink = buildMarkdownLink(url, title)
      // Verify the text at the original range still matches the URL.
      const currentText = editor.sliceDoc(insertFrom, insertTo)
      if (currentText === url) {
        editor.replaceRange(insertFrom, insertTo, mdLink)
      }
    })
    return true
  }

  // Smart paste: HTML → Markdown
  if (event.clipboardData) {
    const markdown = tryConvertClipboardHtml(event.clipboardData)
    if (markdown) {
      ed.insertText(markdown)
      return true
    }

    // Smart paste: TSV (Excel/Sheets) → Markdown table
    const table = tryConvertTsvToTable(text)
    if (table) {
      ed.insertText(table)
      return true
    }

    // Smart paste: code detection → fenced code block
    const codeBlock = tryWrapAsCodeBlock(text)
    if (codeBlock) {
      ed.insertText(codeBlock)
      return true
    }
  }

  return false
}

function handleDrop(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
  if (!imageFile) return

  event.preventDefault()
  const filePath = activeTab.value?.filePath ?? null
  imageService.handleDropImage(imageFile, filePath).then((src) => {
    if (src && editor) {
      editor.insertText(`![](${src})`)
    }
  })
}

onMounted(() => {
  if (!containerRef.value) return
  editor = new SourceEditor(containerRef.value, props.content ?? '', pasteHandler)
  editor.onContentChange((md) => emit('change', md))

  // CodeMirror 的滚动容器是 .cm-scroller
  scrollEl = containerRef.value.querySelector('.cm-scroller') as HTMLElement | null
  scrollEl?.addEventListener('scroll', handleScroll, { passive: true })

  containerRef.value.addEventListener('drop', handleDrop)

  // 注册到 EditorManager（SplitView 内嵌时由 SplitView 负责注册）
  if (!props.noRegister) {
    registerEditor(editor)
  }
})

onUnmounted(() => {
  scrollEl?.removeEventListener('scroll', handleScroll)
  containerRef.value?.removeEventListener('drop', handleDrop)
  if (editor) {
    if (!props.noRegister) {
      unregisterEditor(editor)
    }
    editor.destroy()
    editor = null
  }
})

// 暴露 editor 实例给父组件
defineExpose({ editor: () => editor })
</script>

<template>
  <div class="source-view" ref="containerRef" />
</template>
