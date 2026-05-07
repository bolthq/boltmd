<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n } from 'vue-i18n'
import TabBar from './components/tabs/TabBar.vue'
import TitleBar from './components/layout/TitleBar.vue'
import MenuBar from './components/layout/MenuBar.vue'
import StatusBar from './components/layout/StatusBar.vue'
import EditorContainer from './components/editor/EditorContainer.vue'
const Toolbar = defineAsyncComponent(() => import('./components/editor/Toolbar.vue'))
const OutlinePanel = defineAsyncComponent(() => import('./components/editor/OutlinePanel.vue'))
const SettingsPanel = defineAsyncComponent(() => import('./components/settings/SettingsPanel.vue'))
const CommandPalette = defineAsyncComponent(() => import('./components/common/CommandPalette.vue'))
const AboutDialog = defineAsyncComponent(() => import('./components/common/AboutDialog.vue'))
import { useEditorManager } from './core/editor/EditorManager'
import { parseHeadings } from './core/services/OutlineService'
import { useAutoSave } from './core/editor/useAutoSave'
import { tabs, activeTab, activeTabId, initTabs, createTab, closeTab, switchTab, openBundledDocTab, saveSession, restoreSession, reloadTab } from './core/stores/tabStore'
import { saveFile, saveFileAs, openFile, openFilePath, getRecentFiles } from './core/stores/fileStore'
import { fileWatcherService } from './core/services/FileWatcherService'
import { themeService } from './core/services/ThemeService'
import { configService } from './core/services/ConfigService'
import { updateService } from './core/services/UpdateService'
import { loadBundledDoc, type BundledDocName } from './core/services/BundledDocs'
import type { WindowState } from './core/types/config'
import type { Command } from './components/common/CommandPalette.vue'

const { mode, content, cycleMode, switchMode, getActiveEditor } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()
const { t } = useI18n()

const showToolbar = ref(configService.get('showToolbar'))
const showSettings = ref(false)
const showCommandPalette = ref(false)
const showAbout = ref(false)
const showOutline = ref(configService.get('showOutline') ?? false)
const paletteMode = ref<'commands' | 'recent' | 'headings'>('commands')

// Ref to EditorContainer so MenuBar Find/Replace entries can open the panel
const editorContainerRef = ref<InstanceType<typeof EditorContainer> | null>(null)

/**
 * Open one of the in-app Help docs (Welcome / Markdown Guide) as a fresh
 * tab. The tab is detached from any filesystem path so Ctrl+S routes
 * through Save As and can't overwrite the bundled asset.
 */
async function openHelpDoc(name: BundledDocName): Promise<void> {
  try {
    const { title, content } = await loadBundledDoc(name)
    openBundledDocTab(title, content)
  } catch (err) {
    console.error('[App] Failed to open bundled doc', name, err)
  }
}

// showToolbar 变化时持久化
watch(showToolbar, (val) => { configService.set('showToolbar', val) })
watch(showOutline, (val) => { configService.set('showOutline', val) })

// 命令面板命令列表（computed 以支持语言切换）
const commands = computed<Command[]>(() => [
  { id: 'new-tab', label: t('commands.newTab'), shortcut: 'Ctrl+N', action: () => createTab() },
  { id: 'open-file', label: t('commands.openFile'), shortcut: 'Ctrl+O', action: () => openFile() },
  { id: 'save-file', label: t('commands.saveFile'), shortcut: 'Ctrl+S', action: () => saveFile() },
  { id: 'close-tab', label: t('commands.closeTab'), shortcut: 'Ctrl+W', action: () => { if (activeTabId.value) closeTab(activeTabId.value) } },
  { id: 'cycle-mode', label: t('commands.cycleMode'), shortcut: 'Ctrl+/', action: () => cycleMode() },
  { id: 'mode-wysiwyg', label: t('commands.modeWysiwyg'), action: () => switchMode('wysiwyg') },
  { id: 'mode-source', label: t('commands.modeSource'), action: () => switchMode('source') },
  { id: 'mode-split', label: t('commands.modeSplit'), action: () => switchMode('split') },
  { id: 'toggle-toolbar', label: t('commands.toggleToolbar'), shortcut: 'Ctrl+Shift+T', action: () => { showToolbar.value = !showToolbar.value } },
  { id: 'toggle-outline', label: t('commands.toggleOutline'), shortcut: 'Ctrl+Shift+L', action: () => { showOutline.value = !showOutline.value } },
  { id: 'settings', label: t('commands.openSettings'), shortcut: 'Ctrl+,', action: () => { showSettings.value = true } },
  { id: 'theme-light', label: t('commands.themeLight'), action: () => themeService.setTheme('light') },
  { id: 'theme-dark', label: t('commands.themeDark'), action: () => themeService.setTheme('dark') },
  { id: 'theme-system', label: t('commands.themeSystem'), action: () => themeService.setTheme('system') },
])

// Recent files as command palette entries
const recentFileCommands = computed<Command[]>(() => {
  return getRecentFiles().map((item) => {
    const name = item.path.split(/[\\/]/).pop() || item.path
    return {
      id: `recent:${item.path}`,
      label: name,
      shortcut: item.path,
      action: () => openFilePath(item.path),
    }
  })
})

// Headings as command palette entries for quick jump (Ctrl+Shift+O)
const headingCommands = computed<Command[]>(() => {
  const headings = parseHeadings(content.value)
  return headings.map((item, index) => ({
    id: `heading:${index}`,
    label: `${'  '.repeat(item.level - 1)}${item.text}`,
    action: () => {
      const editor = getActiveEditor()
      if (!editor) return
      editor.setCursorPosition({ line: item.line + 1, column: 0, offset: 0 })
      editor.focus()
    },
  }))
})

// Active palette commands depend on mode
const paletteCommands = computed(() => {
  if (paletteMode.value === 'recent') return recentFileCommands.value
  if (paletteMode.value === 'headings') return headingCommands.value
  return commands.value
})

const palettePlaceholder = computed(() => {
  if (paletteMode.value === 'recent') return t('commands.recentPlaceholder')
  if (paletteMode.value === 'headings') return t('commands.headingsPlaceholder')
  return undefined
})

let unlistenDragDrop: (() => void) | null = null
let unlistenSingleInstance: (() => void) | null = null

// 将编辑器配置应用到 CSS 变量
function applyEditorConfig(): void {
  const root = document.documentElement
  root.style.setProperty('--font-size-editor', `${configService.get('fontSize')}px`)
  root.style.setProperty('--font-editor', configService.get('fontFamily'))
  root.style.setProperty('--line-height-editor', String(configService.get('lineHeight')))
}

// 注册编辑器配置变更监听
function watchEditorConfig(): void {
  configService.onChange('fontSize', () => applyEditorConfig())
  configService.onChange('fontFamily', () => applyEditorConfig())
  configService.onChange('lineHeight', () => applyEditorConfig())
}

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

// 标题栏：设置原生窗口标题（任务栏显示用），防抖避免高频 IPC
let titleTimer: ReturnType<typeof setTimeout> | null = null
watch(
  activeTab,
  (tab) => {
    const title = tab ? `${tab.fileName}${tab.dirty ? ' *' : ''} — BoltMD` : 'BoltMD'
    if (titleTimer) clearTimeout(titleTimer)
    titleTimer = setTimeout(() => {
      getCurrentWindow().setTitle(title)
    }, 300)
  },
  { immediate: true },
)

// 全局快捷键
function handleKeydown(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey

  // Block browser-style refresh shortcuts in production — WebView reload
  // discards in-memory state and loses unsaved tabs.
  // Note: Ctrl+R is handled below as "open recent files" (which also prevents refresh).
  if (e.key === 'F5') {
    e.preventDefault()
    return
  }

  // Ctrl+/ 循环切换编辑模式
  if (ctrl && e.key === '/') {
    e.preventDefault()
    cycleMode()
    return
  }

  // Ctrl+Shift+P 打开命令面板
  if (ctrl && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    paletteMode.value = 'commands'
    showCommandPalette.value = !showCommandPalette.value
    return
  }

  // Ctrl+R 打开最近文件搜索
  if (ctrl && !e.shiftKey && e.key === 'r') {
    e.preventDefault()
    paletteMode.value = 'recent'
    showCommandPalette.value = !showCommandPalette.value
    return
  }

  // Ctrl+Shift+O 快速跳转到标题
  if (ctrl && e.shiftKey && e.key === 'O') {
    e.preventDefault()
    paletteMode.value = 'headings'
    showCommandPalette.value = !showCommandPalette.value
    return
  }

  // Ctrl+Shift+T 显示/隐藏工具栏
  if (ctrl && e.shiftKey && e.key === 'T') {
    e.preventDefault()
    showToolbar.value = !showToolbar.value
    return
  }

  // Ctrl+Shift+L 显示/隐藏大纲面板
  if (ctrl && e.shiftKey && e.key === 'L') {
    e.preventDefault()
    showOutline.value = !showOutline.value
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

  // 应用编辑器配置到 CSS 变量并监听变更
  applyEditorConfig()
  watchEditorConfig()

  // All initialisation is wrapped in try/catch so that a failure in
  // session restore or bundled-doc loading never leaves the app in a
  // broken state.
  try {
    // Check for CLI file (double-click launch).
    // Window geometry is already restored by the Rust setup hook, so we
    // only need to check for a file-association argument here.
    const cliFiles = await invoke<string[]>('get_cli_file')

    // When launched via file association (double-click a .md), skip session
    // restore and only open the requested file(s).
    if (cliFiles.length > 0) {
      switchMode(configService.get('defaultMode'))
      for (const file of cliFiles) {
        await openFilePath(file)
      }
    } else {
      const restored = await restoreSession()

      if (!restored) {
        // No previous session — apply the configured default editor mode
        switchMode(configService.get('defaultMode'))

        // First launch: open Welcome + Markdown Guide bundled docs
        if (configService.get('firstLaunch')) {
          await openHelpDoc('welcome')
          await openHelpDoc('markdown-guide')
          // Switch to the Welcome tab (first tab)
          if (tabs.value.length > 0) {
            switchTab(tabs.value[0].id)
          }
          await configService.set('firstLaunch', false)
        } else {
          initTabs()
        }
      }
    }
  } catch (err) {
    console.error('[App] Initialisation error:', err)
    // Ensure the user has at least one blank tab so the app is usable.
    if (tabs.value.length === 0) {
      initTabs()
    }
  }

  // Drag-and-drop: open all dropped files as tabs.
  unlistenDragDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
      for (const path of event.payload.paths) {
        await openFilePath(path)
      }
    }
  }).catch((err: unknown) => {
    console.warn('[App] Failed to register drag-drop listener:', err)
    const noop: () => void = () => {}
    return noop
  })

  // Initialize file watcher: detect external file changes.
  await fileWatcherService.init(
    // onReload: re-read the file and update the tab content.
    async (path: string) => { await reloadTab(path) },
    // isDirty: check if the tab with the given path has local edits.
    (path: string) => {
      const tab = tabs.value.find((tab) => tab.filePath === path)
      return tab?.dirty ?? false
    },
  )
  // Watch all currently open file-backed tabs.
  for (const tab of tabs.value) {
    if (tab.filePath) {
      await fileWatcherService.watch(tab.filePath)
    }
  }

  // Single-instance: another process tried to launch — open its file here.
  unlistenSingleInstance = await listen<string>('single-instance-open-file', async (event) => {
    if (event.payload) {
      await openFilePath(event.payload)
    }
  })

  // Intercept window close: persist session, warn about unsaved changes.
  getCurrentWindow().onCloseRequested(async (event) => {
    await saveSession()
    await saveWindowState()

    const dirtyTabs = tabs.value.filter((tab) => tab.dirty)
    if (dirtyTabs.length === 0) return

    event.preventDefault()

    // Build a user-friendly message listing all unsaved files.
    const names = dirtyTabs.map((tab) => tab.fileName)
    const msg =
      dirtyTabs.length === 1
        ? t('app.unsavedMessage', { name: names[0] })
        : t('app.unsavedMultiple', { count: dirtyTabs.length, names: names.join(', ') })

    const confirmed = await ask(msg, {
      title: t('app.unsavedTitle'),
      kind: 'warning',
      okLabel: t('app.discard'),
      cancelLabel: t('app.cancel'),
    })

    if (confirmed) {
      await getCurrentWindow().destroy()
    }
    // User chose "Cancel" — stay open, do nothing.
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopAutoSave()
  fileWatcherService.dispose()
  unlistenDragDrop?.()
  unlistenSingleInstance?.()
  if (titleTimer) clearTimeout(titleTimer)
})
</script>

<template>
  <div class="app-shell" style="height: 100vh; display: flex; flex-direction: column;">
    <!-- 自定义标题栏 -->
    <TitleBar />
    <!-- 菜单栏 -->
    <MenuBar
      :show-toolbar="showToolbar"
      :show-outline="showOutline"
      @new-tab="createTab()"
      @open-file="openFile()"
      @save="saveFile()"
      @save-as="saveFileAs()"
      @close-tab="activeTabId && closeTab(activeTabId)"
      @toggle-toolbar="showToolbar = !showToolbar"
      @toggle-outline="showOutline = !showOutline"
      @open-settings="showSettings = true"
      @open-command-palette="showCommandPalette = true"
      @check-update="updateService.checkForUpdates()"
      @open-welcome="openHelpDoc('welcome')"
      @open-markdown-guide="openHelpDoc('markdown-guide')"
      @find="editorContainerRef?.openFind()"
      @replace="editorContainerRef?.openReplace()"
      @open-about="showAbout = true"
    />
    <!-- 标签栏 -->
    <TabBar />
    <!-- 工具栏（仅 WYSIWYG 模式 + 用户开启时显示） -->
    <Toolbar v-if="showToolbar && mode === 'wysiwyg'" />
    <!-- Main content area: editor + optional outline sidebar -->
    <div class="main-content">
      <EditorContainer ref="editorContainerRef" />
      <OutlinePanel v-if="showOutline" @close="showOutline = false" />
    </div>
    <!-- 状态栏 -->
    <StatusBar />
    <!-- 设置面板 -->
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    <!-- 命令面板 -->
    <CommandPalette v-if="showCommandPalette" :commands="paletteCommands" :placeholder="palettePlaceholder" @close="showCommandPalette = false" />
    <!-- 关于对话框 -->
    <AboutDialog v-if="showAbout" @close="showAbout = false" />
  </div>
</template>

<style scoped>
.main-content {
  flex: 1;
  display: flex;
  min-height: 0;
}
</style>
