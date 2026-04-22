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
const SettingsPanel = defineAsyncComponent(() => import('./components/settings/SettingsPanel.vue'))
const CommandPalette = defineAsyncComponent(() => import('./components/common/CommandPalette.vue'))
import { useEditorManager } from './core/editor/EditorManager'
import { useAutoSave } from './core/editor/useAutoSave'
import { tabs, activeTab, activeTabId, initTabs, createTab, closeTab, switchTab, saveSession, restoreSession } from './core/stores/tabStore'
import { saveFile, openFile, openFilePath } from './core/stores/fileStore'
import { themeService } from './core/services/ThemeService'
import { configService } from './core/services/ConfigService'
import type { WindowState } from './core/types/config'
import type { Command } from './components/common/CommandPalette.vue'

const { mode, cycleMode, switchMode } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()

const showToolbar = ref(true)
const showSettings = ref(false)
const showCommandPalette = ref(false)

// 命令面板命令列表
const commands: Command[] = [
  { id: 'new-tab', label: 'New Tab', shortcut: 'Ctrl+N', action: () => createTab() },
  { id: 'open-file', label: 'Open File', shortcut: 'Ctrl+O', action: () => openFile() },
  { id: 'save-file', label: 'Save File', shortcut: 'Ctrl+S', action: () => saveFile() },
  { id: 'close-tab', label: 'Close Tab', shortcut: 'Ctrl+W', action: () => { if (activeTabId.value) closeTab(activeTabId.value) } },
  { id: 'cycle-mode', label: 'Cycle Editor Mode', shortcut: 'Ctrl+/', action: () => cycleMode() },
  { id: 'mode-wysiwyg', label: 'Switch to WYSIWYG Mode', action: () => switchMode('wysiwyg') },
  { id: 'mode-source', label: 'Switch to Source Mode', action: () => switchMode('source') },
  { id: 'mode-split', label: 'Switch to Split Mode', action: () => switchMode('split') },
  { id: 'toggle-toolbar', label: 'Toggle Toolbar', shortcut: 'Ctrl+Shift+T', action: () => { showToolbar.value = !showToolbar.value } },
  { id: 'settings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => { showSettings.value = true } },
  { id: 'theme-light', label: 'Theme: Light', action: () => themeService.setTheme('light') },
  { id: 'theme-dark', label: 'Theme: Dark', action: () => themeService.setTheme('dark') },
  { id: 'theme-system', label: 'Theme: Follow System', action: () => themeService.setTheme('system') },
]

let unlistenDragDrop: (() => void) | null = null

// 保存当前窗口状态到 ConfigService
async function saveWindowState(): Promise<void> {
  const win = getCurrentWindow()
  const maximized = await win.isMaximized()
  // 最大化时不保存位置/大小，恢复时先还原位置再最大化
  if (!maximized) {
    const size = await win.innerSize()
    const pos = await win.outerPosition()
    const state: WindowState = {
      width: size.width,
      height: size.height,
      x: pos.x,
      y: pos.y,
      maximized: false,
    }
    await configService.set('windowState', state)
  } else {
    // 保留之前的位置/大小，只标记最大化
    const prev = configService.get('windowState')
    const state: WindowState = {
      width: prev?.width ?? 1200,
      height: prev?.height ?? 800,
      x: prev?.x ?? 100,
      y: prev?.y ?? 100,
      maximized: true,
    }
    await configService.set('windowState', state)
  }
}

// 恢复窗口状态
async function restoreWindowState(): Promise<void> {
  const state = configService.get('windowState')
  if (!state) return
  const win = getCurrentWindow()
  try {
    const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi')
    await win.setSize(new LogicalSize(state.width, state.height))
    await win.setPosition(new LogicalPosition(state.x, state.y))
    if (state.maximized) {
      await win.maximize()
    }
  } catch {
    // 忽略恢复失败（如坐标超出屏幕范围）
  }
}

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

  // Ctrl+Shift+P 打开命令面板
  if (ctrl && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
    return
  }

  // Ctrl+Shift+T 显示/隐藏工具栏
  if (ctrl && e.shiftKey && e.key === 'T') {
    e.preventDefault()
    showToolbar.value = !showToolbar.value
    return
  }

  // Ctrl+, 打开/关闭设置面板
  if (ctrl && e.key === ',') {
    e.preventDefault()
    showSettings.value = !showSettings.value
    return
  }

  // Escape 关闭浮层面板
  if (e.key === 'Escape') {
    if (showCommandPalette.value) {
      // CommandPalette 内部处理 Escape，这里是后备
      return
    }
    if (showSettings.value) {
      e.preventDefault()
      showSettings.value = false
      return
    }
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

  // 恢复窗口状态（大小/位置）
  await restoreWindowState()

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

  // 关窗拦截：保存会话和窗口状态，有未保存内容时弹确认框
  getCurrentWindow().onCloseRequested(async (event) => {
    await saveSession()
    await saveWindowState()
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
    <!-- 设置面板 -->
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    <!-- 命令面板 -->
    <CommandPalette v-if="showCommandPalette" :commands="commands" @close="showCommandPalette = false" />
  </div>
</template>

<style scoped>
</style>
