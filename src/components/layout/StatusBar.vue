<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useEditorManager } from '../../core/editor/EditorManager'
import { fileEncoding } from '../../core/stores/fileStore'
import { themeService } from '../../core/services/ThemeService'
import type { ThemeName } from '../../core/types/config'
import type { CursorPosition, WordCount } from '../../core/editor/types'

const { mode, switchMode, getActiveEditor } = useEditorManager()

// 模式名称映射
const modeLabels: Record<string, string> = {
  wysiwyg: 'WYSIWYG',
  source: 'Source',
  split: 'Split',
}

// 状态数据（通过定时器刷新）
const cursor = ref<CursorPosition>({ line: 0, column: 0, offset: 0 })
const wordCount = ref<WordCount>({ characters: 0, words: 0, lines: 0 })
const currentTheme = ref<ThemeName>(themeService.getCurrentTheme())

let idleTimer: ReturnType<typeof setTimeout> | null = null

function refreshStats() {
  const editor = getActiveEditor()
  if (editor) {
    cursor.value = editor.getCursorPosition()
    wordCount.value = editor.getWordCount()
  }
}

function scheduleRefresh() {
  if (idleTimer) clearTimeout(idleTimer)
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      refreshStats()
      idleTimer = setTimeout(scheduleRefresh, 1000)
    })
  } else {
    idleTimer = setTimeout(() => {
      refreshStats()
      scheduleRefresh()
    }, 1000)
  }
}

// 模式循环切换
function handleModeClick() {
  const modes = ['wysiwyg', 'source', 'split'] as const
  const idx = modes.indexOf(mode.value)
  switchMode(modes[(idx + 1) % modes.length])
}

// 主题循环切换
function handleThemeClick() {
  const themes: ThemeName[] = ['light', 'dark', 'system']
  const idx = themes.indexOf(currentTheme.value)
  const next = themes[(idx + 1) % themes.length]
  themeService.setTheme(next)
  currentTheme.value = next
}

const themeLabels: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

onMounted(() => {
  scheduleRefresh()
})

onUnmounted(() => {
  if (idleTimer) clearTimeout(idleTimer)
})
</script>

<template>
  <div class="statusbar">
    <div class="statusbar-left">
      <span class="statusbar-item">{{ fileEncoding }}</span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item">{{ wordCount.lines }} lines</span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item">{{ wordCount.words }} words</span>
    </div>
    <div class="statusbar-right">
      <span class="statusbar-item">Ln {{ cursor.line + 1 }}, Col {{ cursor.column + 1 }}</span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item statusbar-clickable" @click="handleModeClick" title="Click to switch mode">
        {{ modeLabels[mode] }}
      </span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item statusbar-clickable" @click="handleThemeClick" title="Click to switch theme">
        {{ themeLabels[currentTheme] }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
  padding: 0 12px;
  background: var(--statusbar-bg);
  color: var(--statusbar-text);
  border-top: 1px solid var(--border-primary);
  font-size: 11px;
  font-family: var(--font-mono);
  flex-shrink: 0;
  user-select: none;
}

.statusbar-left,
.statusbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.statusbar-sep {
  color: var(--text-muted);
  opacity: 0.5;
}

.statusbar-item {
  white-space: nowrap;
}

.statusbar-clickable {
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
}

.statusbar-clickable:hover {
  background: var(--bg-hover);
  color: var(--accent-primary);
}
</style>
