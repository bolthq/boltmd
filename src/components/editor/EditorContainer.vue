<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorManager } from '../../core/editor/EditorManager'
import { activeTabId, updateTabContent } from '../../core/stores/tabStore'
import { isFileLoading } from '../../core/stores/fileStore'
import EditorCore from './EditorCore.vue'
import SourceView from './SourceView.vue'
import SplitView from './SplitView.vue'
import FindReplacePanel from '../common/FindReplacePanel.vue'

const { mode, content, getSelectionInEditor } = useEditorManager()
const { t } = useI18n()

// 查找/替换面板当前模式；null = 关闭
const findPanelMode = ref<'find' | 'replace' | null>(null)
const findPanelRef = ref<InstanceType<typeof FindReplacePanel> | null>(null)
// Value used to prefill the find input on the next panel mount. Kept in a
// ref so it's reactive for the initial render; we only read it at mount
// time, subsequent re-opens pass the fresh selection via focus(prefill).
const findPanelInitialQuery = ref('')

// Grab the editor's current selection and return it only when it's a
// non-empty, single-line string — multi-line selections are rarely what
// the user wants in a find box and would make the input grow awkwardly.
function readSinglelineSelection(): string {
  const sel = getSelectionInEditor()
  if (!sel) return ''
  if (sel.includes('\n') || sel.includes('\r')) return ''
  return sel
}

function openFind() {
  const prefill = readSinglelineSelection()
  if (findPanelMode.value === 'find') {
    // Panel already open → refocus; overwrite query only if user selected
    // something fresh in the editor since last time.
    findPanelRef.value?.focus(prefill)
  } else {
    findPanelInitialQuery.value = prefill
    findPanelMode.value = 'find'
  }
}

function openReplace() {
  const prefill = readSinglelineSelection()
  if (findPanelMode.value === 'replace') {
    findPanelRef.value?.focus(prefill)
  } else {
    findPanelInitialQuery.value = prefill
    findPanelMode.value = 'replace'
  }
}

function closeFindPanel() {
  findPanelMode.value = null
  findPanelInitialQuery.value = ''
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

// Global shortcuts: Ctrl+F / Ctrl+H open our panel; Ctrl+G / F3 are swallowed
// so neither CodeMirror's built-in search nor the Webview's find-in-page popup
// can hijack them while our panel owns find/replace UX.
function handleGlobalKeydown(e: KeyboardEvent) {
  // F3 / Shift+F3: next / previous match when panel is open
  if (e.key === 'F3') {
    e.preventDefault()
    e.stopPropagation()
    if (findPanelMode.value === null) {
      openFind()
    }
    return
  }

  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    e.stopPropagation()
    openFind()
    return
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault()
    e.stopPropagation()
    openReplace()
    return
  }
  // Swallow Ctrl+G / Ctrl+Shift+G so the Webview / CM6 can't pop their own
  // search UI. When our panel is open, route them to next / previous match.
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault()
    e.stopPropagation()
    if (findPanelMode.value === null) {
      openFind()
    }
    return
  }
}

// Use capture phase so we see Ctrl+F before CodeMirror's internal keymap
// handlers (which otherwise swallow it in Source/Split mode, letting the
// Webview's native find-in-page popup take over).
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, { capture: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, { capture: true })
})

// 暴露方法给外部（MenuBar 会用）
defineExpose({
  openFind,
  openReplace,
})
</script>

<template>
  <div class="editor-container">
    <!-- Loading overlay shown while a file is being read from disk -->
    <div v-if="isFileLoading" class="editor-loading-overlay">
      <div class="editor-loading-spinner" />
      <span class="editor-loading-text">{{ t('editor.loading') }}</span>
    </div>

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
      :initial-query="findPanelInitialQuery"
      @close="closeFindPanel"
      @mode-change="handleModeChange"
    />
  </div>
</template>
