<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useEditorManager } from '../../core/editor/EditorManager'
import { activeTabId, updateTabContent } from '../../core/stores/tabStore'
import EditorCore from './EditorCore.vue'
import SourceView from './SourceView.vue'
import SplitView from './SplitView.vue'
import FindReplacePanel from '../common/FindReplacePanel.vue'

const { mode, content } = useEditorManager()

// 查找/替换面板当前模式；null = 关闭
const findPanelMode = ref<'find' | 'replace' | null>(null)
const findPanelRef = ref<InstanceType<typeof FindReplacePanel> | null>(null)

function openFind() {
  if (findPanelMode.value === 'find') {
    // 已打开 → 重新聚焦查找框
    findPanelRef.value?.focus()
  } else {
    findPanelMode.value = 'find'
  }
}

function openReplace() {
  if (findPanelMode.value === 'replace') {
    findPanelRef.value?.focus()
  } else {
    findPanelMode.value = 'replace'
  }
}

function closeFindPanel() {
  findPanelMode.value = null
}

function handleModeChange(m: 'find' | 'replace') {
  findPanelMode.value = m
}

function handleChange(newContent: string) {
  const tabId = activeTabId.value
  if (tabId) {
    updateTabContent(tabId, newContent)
  }
}

// 全局快捷键（Ctrl+F / Ctrl+H）
function handleGlobalKeydown(e: KeyboardEvent) {
  // macOS 下使用 metaKey，其他平台 ctrlKey
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    openFind()
    return
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    openReplace()
    return
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

// 暴露方法给外部（MenuBar 会用）
defineExpose({
  openFind,
  openReplace,
})
</script>

<template>
  <div class="editor-container">
    <!-- WYSIWYG 模式 -->
    <EditorCore
      v-if="mode === 'wysiwyg'"
      :content="content"
      @change="handleChange"
    />

    <!-- 源码模式 -->
    <SourceView
      v-if="mode === 'source'"
      :content="content"
      @change="handleChange"
    />

    <!-- 分屏模式 -->
    <SplitView
      v-if="mode === 'split'"
      :content="content"
      @change="handleChange"
    />

    <!-- 查找/替换面板（浮层） -->
    <FindReplacePanel
      v-if="findPanelMode !== null"
      ref="findPanelRef"
      :mode="findPanelMode"
      @close="closeFindPanel"
      @mode-change="handleModeChange"
    />
  </div>
</template>
