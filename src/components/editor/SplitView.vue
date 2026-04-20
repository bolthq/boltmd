<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions } from '../../core/editor/WysiwygEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'
import SourceView from './SourceView.vue'
import type { IEditor } from '../../core/editor/types'

const props = defineProps<{
  content?: string
}>()

const emit = defineEmits<{
  change: [content: string]
}>()

// 当前 Markdown 内容（源码区编辑时更新）
const markdownContent = ref(props.content ?? '')

// 预览容器引用（用于同步滚动）
const previewMount = ref<HTMLElement | null>(null)

// SourceView 组件引用
const sourceViewRef = ref<InstanceType<typeof SourceView> | null>(null)

// 已注册的编辑器引用
let registeredEditor: IEditor | null = null

// 预览用 Tiptap 实例（只读模式）
const previewEditor = useEditor({
  extensions: createWysiwygExtensions(),
  content: markdownContent.value,
  editable: false,
})

// 防抖定时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 防止滚动事件互相触发
let isSyncingScroll = false

// 源码区内容变化 → 防抖 200ms → 更新预览
function onSourceChange(md: string) {
  markdownContent.value = md
  emit('change', md)

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    previewEditor.value?.commands.setContent(md)
  }, 200)
}

// 源码区滚动 → 同步预览区（按滚动比例）
function onSourceScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
  if (isSyncingScroll) return
  const previewEl = previewMount.value?.querySelector('.ProseMirror') as HTMLElement | null
  if (!previewEl) return

  const ratio = scrollHeight <= clientHeight
    ? 0
    : scrollTop / (scrollHeight - clientHeight)

  isSyncingScroll = true
  previewEl.scrollTop = ratio * (previewEl.scrollHeight - previewEl.clientHeight)
  requestAnimationFrame(() => { isSyncingScroll = false })
}

// SourceView 挂载后，注册其 SourceEditor 到 EditorManager
watch(sourceViewRef, async (newRef) => {
  // 先注销旧的
  if (registeredEditor) {
    unregisterEditor(registeredEditor)
    registeredEditor = null
  }

  if (newRef) {
    // 等待 SourceView 的 onMounted 执行完
    await nextTick()
    const editorFn = newRef.editor
    if (typeof editorFn === 'function') {
      const editor = editorFn()
      if (editor) {
        registeredEditor = editor
        registerEditor(editor)
      }
    }
  }
}, { flush: 'post' })

// 外部 content prop 变化时同步
watch(() => props.content, (newContent) => {
  if (newContent !== undefined && newContent !== markdownContent.value) {
    markdownContent.value = newContent
    previewEditor.value?.commands.setContent(newContent)
    // 同步到 SourceView
    const editorFn = sourceViewRef.value?.editor
    if (typeof editorFn === 'function') {
      const editor = editorFn()
      if (editor && editor.getContent() !== newContent) {
        editor.setContent(newContent)
      }
    }
  }
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (registeredEditor) {
    unregisterEditor(registeredEditor)
    registeredEditor = null
  }
  previewEditor.value?.destroy()
})
</script>

<template>
  <div class="split-view">
    <!-- 左: 源码编辑 (noRegister: SplitView 自行管理注册) -->
    <div class="split-pane">
      <SourceView
        ref="sourceViewRef"
        :content="markdownContent"
        :no-register="true"
        @change="onSourceChange"
        @scroll="onSourceScroll"
      />
    </div>

    <!-- 分隔线 -->
    <div class="split-divider" />

    <!-- 右: 只读预览 -->
    <div class="split-pane preview-pane" ref="previewMount">
      <div class="editor-core">
        <EditorContent class="editor-mount" :editor="previewEditor" />
      </div>
    </div>
  </div>
</template>
