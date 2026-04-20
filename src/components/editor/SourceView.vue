<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SourceEditor } from '../../core/editor/SourceEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'

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

onMounted(() => {
  if (!containerRef.value) return
  editor = new SourceEditor(containerRef.value, props.content ?? '')
  editor.onContentChange((md) => emit('change', md))

  // CodeMirror 的滚动容器是 .cm-scroller
  scrollEl = containerRef.value.querySelector('.cm-scroller') as HTMLElement | null
  scrollEl?.addEventListener('scroll', handleScroll, { passive: true })

  // 注册到 EditorManager（SplitView 内嵌时由 SplitView 负责注册）
  if (!props.noRegister) {
    registerEditor(editor)
  }
})

onUnmounted(() => {
  scrollEl?.removeEventListener('scroll', handleScroll)
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
