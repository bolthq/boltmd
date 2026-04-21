<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SourceEditor } from '../../core/editor/SourceEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'
import { imageService } from '../../core/services/ImageService'
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

function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (!blob) return
      const filePath = activeTab.value?.filePath ?? null
      imageService.handlePasteImage(blob, filePath).then((src) => {
        if (src && editor) {
          editor.insertText(`![](${src})`)
        }
      })
      return
    }
  }
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
  editor = new SourceEditor(containerRef.value, props.content ?? '')
  editor.onContentChange((md) => emit('change', md))

  // CodeMirror 的滚动容器是 .cm-scroller
  scrollEl = containerRef.value.querySelector('.cm-scroller') as HTMLElement | null
  scrollEl?.addEventListener('scroll', handleScroll, { passive: true })

  // 图片粘贴/拖拽事件
  containerRef.value.addEventListener('paste', handlePaste)
  containerRef.value.addEventListener('drop', handleDrop)

  // 注册到 EditorManager（SplitView 内嵌时由 SplitView 负责注册）
  if (!props.noRegister) {
    registerEditor(editor)
  }
})

onUnmounted(() => {
  scrollEl?.removeEventListener('scroll', handleScroll)
  containerRef.value?.removeEventListener('paste', handlePaste)
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
