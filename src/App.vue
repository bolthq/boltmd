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
import { exportHtml, exportPdf } from './core/services/ExportService'
import {
  scanPlugins,
  addPluginInstance,
  updatePluginState,
  setPluginActivated,
  setPluginDeactivated,
  cleanupPlugin,
  resetAll as resetPluginRegistries,
  eventToShortcut,
  findCommandByShortcut,
  findCommandById,
  pluginInstances,
  pluginCommands,
} from './core/plugins'
import { createPluginContext, emitPluginEvent, type PluginContextInternal } from './core/plugins'
import type { WindowState } from './core/types/config'
import type { Command } from './components/common/CommandPalette.vue'

const { mode, content, cycleMode, switchMode, getActiveEditor, typewriterMode } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()
const { t } = useI18n()

const showToolbar = ref(configService.get('showToolbar'))
const showSettings = ref(false)
const showCommandPalette = ref(false)
const showAbout = ref(false)
const showOutline = ref(configService.get('showOutline') ?? false)
const paletteMode = ref<'commands' | 'recent' | 'headings'>('commands')
const zenMode = ref(false)
const zenShowTop = ref(false)
const zenShowBottom = ref(false)
let zenEdgeTimer: ReturnType<typeof setTimeout> | null = null

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

function doExportHtml(): void {
  const md = getActiveEditor()?.getContent() ?? content.value
  const fileName = activeTab.value?.fileName ?? 'untitled.md'
  exportHtml(md, fileName)
}

function doExportPdf(): void {
  const md = getActiveEditor()?.getContent() ?? content.value
  const fileName = activeTab.value?.fileName ?? 'untitled.md'
  exportPdf(md, fileName)
}

// showToolbar 变化时持久化
watch(showToolbar, (val) => { configService.set('showToolbar', val) })
watch(showOutline, (val) => { configService.set('showOutline', val) })

// ── Zen Mode ────────────────────────────────────────────────────────────────

async function toggleZenMode(): Promise<void> {
  const win = getCurrentWindow()
  zenMode.value = !zenMode.value
  typewriterMode.value = zenMode.value
  if (zenMode.value) {
    await win.setFullscreen(true)
  } else {
    await win.setFullscreen(false)
    zenShowTop.value = false
    zenShowBottom.value = false
  }
}

function handleZenMouseMove(e: MouseEvent): void {
  if (!zenMode.value) return

  const EDGE_SIZE = 6
  const y = e.clientY
  const height = window.innerHeight

  if (y <= EDGE_SIZE) {
    zenShowTop.value = true
    if (zenEdgeTimer) clearTimeout(zenEdgeTimer)
  } else if (y >= height - EDGE_SIZE) {
    zenShowBottom.value = true
    if (zenEdgeTimer) clearTimeout(zenEdgeTimer)
  } else {
    if (zenShowTop.value || zenShowBottom.value) {
      if (zenEdgeTimer) clearTimeout(zenEdgeTimer)
      zenEdgeTimer = setTimeout(() => {
        zenShowTop.value = false
        zenShowBottom.value = false
      }, 1500)
    }
  }
}

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
  { id: 'zen-mode', label: t('commands.zenMode'), shortcut: 'F11', action: () => toggleZenMode() },
  { id: 'settings', label: t('commands.openSettings'), shortcut: 'Ctrl+,', action: () => { showSettings.value = true } },
  { id: 'theme-light', label: t('commands.themeLight'), action: () => themeService.setTheme('light') },
  { id: 'theme-dark', label: t('commands.themeDark'), action: () => themeService.setTheme('dark') },
  { id: 'theme-system', label: t('commands.themeSystem'), action: () => themeService.setTheme('system') },
  { id: 'export-html', label: t('commands.exportHtml'), action: () => doExportHtml() },
  { id: 'export-pdf', label: t('commands.exportPdf'), shortcut: 'Ctrl+P', action: () => doExportPdf() },
  { id: 'reload-plugins', label: 'Reload All Plugins', action: () => reloadAllPlugins() },
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
      editor.jumpToHeading(index)
      editor.focus()
    },
  }))
})

// Active palette commands depend on mode
const paletteCommands = computed(() => {
  if (paletteMode.value === 'recent') return recentFileCommands.value
  if (paletteMode.value === 'headings') return headingCommands.value
  // Merge built-in commands with plugin-registered commands.
  const pluginCmds: Command[] = pluginCommands.value.map(pc => ({
    id: pc.id,
    label: pc.label,
    shortcut: pc.shortcut,
    action: pc.action,
  }))
  return [...commands.value, ...pluginCmds]
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

  // F11: toggle Zen mode (fullscreen + hide chrome)
  if (e.key === 'F11') {
    e.preventDefault()
    toggleZenMode()
    return
  }

  // Escape: exit Zen mode first, then close overlays
  if (e.key === 'Escape' && zenMode.value) {
    e.preventDefault()
    toggleZenMode()
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

  // Ctrl+P 导出 PDF (also blocks browser default print)
  if (ctrl && !e.shiftKey && e.key === 'p') {
    e.preventDefault()
    doExportPdf()
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

  // Plugin shortcut lookup (after all built-in shortcuts).
  const shortcutStr = eventToShortcut(e)
  const commandId = findCommandByShortcut(shortcutStr)
  if (commandId) {
    const cmd = findCommandById(commandId)
    if (cmd) {
      e.preventDefault()
      try {
        const result = cmd.action()
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[Plugin] Command "${commandId}" failed:`, err)
          })
        }
      } catch (err) {
        console.error(`[Plugin] Command "${commandId}" threw:`, err)
      }
    }
  }
}

// ── Plugin system ───────────────────────────────────────────────────────────

/** Scan, load, and activate all enabled plugins. */
async function bootstrapPlugins(): Promise<void> {
  try {
    const { plugins, errors } = await scanPlugins()
    const disabledList = configService.get('disabledPlugins') ?? []

    // Log validation errors.
    for (const err of errors) {
      console.warn(`[Plugin] Skipping "${err.dirName}": ${err.reason}`)
    }

    // Register all discovered plugin instances.
    for (const loaded of plugins) {
      addPluginInstance({
        manifest: loaded.manifest,
        state: 'inactive',
        module: null,
        context: null,
        error: null,
        dirPath: loaded.dirPath,
      })
    }

    // Activate enabled plugins.
    for (const loaded of plugins) {
      if (disabledList.includes(loaded.manifest.id)) continue
      await activatePlugin(loaded.manifest.id, loaded.dirPath, loaded.manifest.main)
    }
  } catch (err) {
    console.error('[Plugin] Bootstrap failed:', err)
  }
}

/** Activate a single plugin by loading its entry module. */
async function activatePlugin(pluginId: string, dirPath: string, main: string): Promise<void> {
  updatePluginState(pluginId, 'active')
  try {
    // Convert the plugin's file path to a URL that Vite/Tauri can load.
    // On Tauri, local file access uses the asset protocol or convertFileSrc.
    const { convertFileSrc } = await import('@tauri-apps/api/core')
    const entryUrl = convertFileSrc(`${dirPath}/${main}`)

    // Dynamic import of the plugin entry file.
    const module = await import(/* @vite-ignore */ entryUrl)
    const pluginModule = module.default || module

    if (typeof pluginModule.activate !== 'function') {
      throw new Error(`Plugin "${pluginId}" does not export an activate() function`)
    }

    const context = createPluginContext(
      pluginInstances.value.find(p => p.manifest.id === pluginId)!.manifest
    )
    setPluginActivated(pluginId, pluginModule, context)

    // Call activate with try-catch for runtime protection.
    await pluginModule.activate(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[Plugin] Failed to activate "${pluginId}":`, message)
    updatePluginState(pluginId, 'error', message)
    cleanupPlugin(pluginId)
  }
}

/** Deactivate all active plugins (used during reload and shutdown). */
async function deactivateAllPlugins(): Promise<void> {
  for (const instance of [...pluginInstances.value]) {
    if (instance.state !== 'active') continue
    try {
      // Call plugin's deactivate() if provided.
      if (instance.module?.deactivate) {
        await instance.module.deactivate()
      }
      // Auto-cleanup subscriptions via context disposer.
      if (instance.context) {
        (instance.context as PluginContextInternal).__dispose()
      }
    } catch (err) {
      console.error(`[Plugin] Error deactivating "${instance.manifest.id}":`, err)
    }
    cleanupPlugin(instance.manifest.id)
    setPluginDeactivated(instance.manifest.id)
  }
}

/** Reload all plugins (deactivate → reset → rescan → activate). */
async function reloadAllPlugins(): Promise<void> {
  await deactivateAllPlugins()
  resetPluginRegistries()
  await bootstrapPlugins()
}

// Expose reloadAllPlugins for command palette (P15-8).
// Also emit plugin events on key app lifecycle moments.
watch(
  () => activeTab.value?.filePath,
  (newPath, oldPath) => {
    if (newPath && newPath !== oldPath) {
      emitPluginEvent('file:opened', { path: newPath })
    }
  }
)

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousemove', handleZenMouseMove)

  // Block the WebView default context menu (which includes "Print") on
  // non-editor areas (padding, menubar, titlebar, etc.).  Editor areas
  // (contenteditable WYSIWYG, CodeMirror source, textarea, input) keep their
  // native Copy/Paste/… context menu.
  window.addEventListener('contextmenu', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest('[contenteditable="true"]') ||
      target.closest('textarea') ||
      target.closest('input') ||
      target.closest('.cm-editor')
    ) {
      return
    }
    e.preventDefault()
  })

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

  // Silent update check after a 30-second delay (non-blocking).
  setTimeout(() => { updateService.silentCheck() }, 30_000)

  // ── Plugin system bootstrap ──────────────────────────────────────────────
  await bootstrapPlugins()

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
  window.removeEventListener('mousemove', handleZenMouseMove)
  stopAutoSave()
  fileWatcherService.dispose()
  deactivateAllPlugins()
  unlistenDragDrop?.()
  unlistenSingleInstance?.()
  if (titleTimer) clearTimeout(titleTimer)
  if (zenEdgeTimer) clearTimeout(zenEdgeTimer)
})
</script>

<template>
  <div class="app-shell" :class="{ 'zen-mode': zenMode }" style="height: 100vh; display: flex; flex-direction: column;">
    <!-- 自定义标题栏 -->
    <TitleBar v-show="!zenMode" />
    <!-- 菜单栏 -->
    <MenuBar
      v-show="!zenMode || zenShowTop"
      :show-toolbar="showToolbar"
      :show-outline="showOutline"
      @new-tab="createTab()"
      @open-file="openFile()"
      @save="saveFile()"
      @save-as="saveFileAs()"
      @export-html="doExportHtml()"
      @export-pdf="doExportPdf()"
      @close-tab="activeTabId && closeTab(activeTabId)"
      @toggle-toolbar="showToolbar = !showToolbar"
      @toggle-outline="showOutline = !showOutline"
      @zen-mode="toggleZenMode()"
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
    <TabBar v-show="!zenMode" />
    <!-- 工具栏（仅 WYSIWYG 模式 + 用户开启时显示） -->
    <Toolbar v-if="showToolbar && mode === 'wysiwyg' && !zenMode" />
    <!-- Main content area: editor + optional outline sidebar -->
    <div class="main-content">
      <OutlinePanel v-if="showOutline && !zenMode" @close="showOutline = false" />
      <EditorContainer ref="editorContainerRef" />
    </div>
    <!-- 状态栏 -->
    <StatusBar v-show="!zenMode || zenShowBottom" />
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

/* Zen mode: edge-revealed menu/status float over editor */
.zen-mode :deep(.menubar) {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.zen-mode :deep(.statusbar) {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
}
</style>
