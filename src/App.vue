<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { ask } from '@tauri-apps/plugin-dialog'
import TabBar from './components/tabs/TabBar.vue'
import EditorContainer from './components/editor/EditorContainer.vue'
import { useEditorManager } from './core/editor/EditorManager'
import { useAutoSave } from './core/editor/useAutoSave'
import { activeTab, initTabs } from './core/stores/tabStore'
import { saveFile, openFilePath } from './core/stores/fileStore'

const { mode, cycleMode } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()

let unlistenDragDrop: (() => void) | null = null

// 初始化标签页（创建第一个空白标签）
initTabs()

// 标题栏：「文件名 [*] — BoltMD」
watch(
  activeTab,
  (tab) => {
    if (!tab) return
    const title = `${tab.fileName}${tab.dirty ? ' *' : ''} — BoltMD`
    getCurrentWindow().setTitle(title)
  },
  { immediate: true },
)

// 模式名称映射（显示用）
const modeLabels: Record<string, string> = {
  wysiwyg: 'WYSIWYG',
  source: 'Source',
  split: 'Split',
}

// 全局快捷键
function handleKeydown(e: KeyboardEvent) {
  // Ctrl+/ 或 Cmd+/ 循环切换模式
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault()
    cycleMode()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

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

  // 关窗拦截：有未保存内容时弹确认框
  getCurrentWindow().onCloseRequested(async (event) => {
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
    <!-- 标签栏 -->
    <TabBar />
    <!-- 临时模式指示器（Phase 8 会替换为正式状态栏） -->
    <div class="mode-indicator">
      <span class="mode-label">{{ modeLabels[mode] }}</span>
      <span class="mode-hint">Ctrl+/ to switch</span>
    </div>
    <EditorContainer />
  </div>
</template>

<style scoped>
.mode-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  font-size: 12px;
  flex-shrink: 0;
}

.mode-label {
  color: var(--accent-primary);
  font-weight: 600;
  font-family: var(--font-mono);
}

.mode-hint {
  color: var(--text-muted);
}
</style>
