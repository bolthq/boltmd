<script setup lang="ts">
import { ref, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { ask } from '@tauri-apps/plugin-dialog'
import TabBar from './components/tabs/TabBar.vue'
import TitleBar from './components/layout/TitleBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorContainer from './components/editor/EditorContainer.vue'
const Toolbar = defineAsyncComponent(() => import('./components/editor/Toolbar.vue'))
import { useEditorManager } from './core/editor/EditorManager'
import { useAutoSave } from './core/editor/useAutoSave'
import { tabs, activeTab, activeTabId, initTabs, createTab, closeTab, switchTab, saveSession, restoreSession } from './core/stores/tabStore'
import { saveFile, openFile, openFilePath } from './core/stores/fileStore'
import { themeService } from './core/services/ThemeService'

const { mode, cycleMode } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()

const showToolbar = ref(true)

let unlistenDragDrop: (() => void) | null = null

// 标题栏：设置原生窗口标题（任务栏显示用）
watch(
  activeTab,
  (tab) => {
    const title = tab ? `${tab.fileName}${tab.dirty ? ' *' : ''} — BoltMD` : 'BoltMD'
    getCurrentWindow().setTitle(title)
  },
  { immediate: true },
)

// 全局快捷键
function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey

  // Ctrl+/ 循环切换编辑模式
  if (ctrl && e.key === '/') {
    e.preventDefault()
    cycleMode()
    return
  }

  // Ctrl+Shift+T 显示/隐藏工具栏
  if (ctrl && e.shiftKey && e.key === 'T') {
    e.preventDefault()
    showToolbar.value = !showToolbar.value
    return
  }

  // Ctrl+N 新建标签
  if (ctrl && e.key === 'n') {
    e.preventDefault()
    createTab()
    return
  }

  // Ctrl+O 打开文件到新标签
  if (ctrl && e.key === 'o') {
    e.preventDefault()
    openFile()
    return
  }

  // Ctrl+W 关闭当前标签
  if (ctrl && e.key === 'w') {
    e.preventDefault()
    if (activeTabId.value) {
      closeTab(activeTabId.value)
    }
    return
  }

  // Ctrl+S 保存当前文件
  if (ctrl && e.key === 's') {
    e.preventDefault()
    saveFile()
    return
  }

  // Ctrl+Tab / Ctrl+Shift+Tab 切换标签
  if (ctrl && e.key === 'Tab') {
    e.preventDefault()
    const list = tabs.value
    if (list.length <= 1) return
    const currentIndex = list.findIndex((t) => t.id === activeTabId.value)
    const delta = e.shiftKey ? -1 : 1
    const nextIndex = (currentIndex + delta + list.length) % list.length
    switchTab(list[nextIndex].id)
    return
  }

  // Ctrl+1~9 跳转到第N个标签
  if (ctrl && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const index = parseInt(e.key) - 1
    const list = tabs.value
    if (index < list.length) {
      switchTab(list[index].id)
    }
    return
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

  // 初始化主题
  themeService.init()

  // 恢复上次的标签会话；若无会话则创建空白标签
  const restored = await restoreSession()
  if (!restored) {
    initTabs()
  }

  // CLI 参数：启动时若传入文件路径则打开
  const cliFile = await invoke<string | null>('get_cli_file')
  if (cliFile) {
    await openFilePath(cliFile)
  }

  // 拖拽打开：取第一个拖入的文件路径
  unlistenDragDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
      await openFilePath(event.payload.paths[0])
    }
  })

  // 关窗拦截：保存会话，有未保存内容时弹确认框
  getCurrentWindow().onCloseRequested(async (event) => {
    await saveSession()
    const tab = activeTab.value
    if (!tab?.dirty) return
    event.preventDefault()
    const confirmed = await ask(
      `"${tab.fileName}" has unsaved changes. Save before closing?`,
      { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Save', cancelLabel: 'Discard' },
    )
    if (confirmed) {
      await saveFile()
    }
    await getCurrentWindow().destroy()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopAutoSave()
  unlistenDragDrop?.()
})
</script>

<template>
  <div class="app-shell" style="height: 100vh; display: flex; flex-direction: column;">
    <!-- 自定义标题栏 -->
    <TitleBar />
    <!-- 标签栏 -->
    <TabBar />
    <!-- 工具栏（仅 WYSIWYG 模式 + 用户开启时显示） -->
    <Toolbar v-if="showToolbar && mode === 'wysiwyg'" />
    <EditorContainer />
    <!-- 状态栏 -->
    <StatusBar />
  </div>
</template>

<style scoped>
</style>
