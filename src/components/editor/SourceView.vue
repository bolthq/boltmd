<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { SourceEditor } from '../../core/editor/SourceEditor'

const props = defineProps<{
  content?: string
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
})

onUnmounted(() => {
  scrollEl?.removeEventListener('scroll', handleScroll)
  editor?.destroy()
  editor = null
})

// 暴露 editor 实例给父组件（EditorManager 阶段使用）
defineExpose({ editor: () => editor })
</script>

<template>
  <div class="source-view" ref="containerRef" />
</template>
