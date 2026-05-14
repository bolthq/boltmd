<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorManager } from '../../core/editor/EditorManager'
import { fileEncoding } from '../../core/stores/fileStore'
import { themeService } from '../../core/services/ThemeService'
import { parseHeadings } from '../../core/services/OutlineService'
import type { ThemeName } from '../../core/types/config'
import type { CursorPosition, WordCount } from '../../core/editor/types'

const { t } = useI18n()
const { mode, content, activeHeadingIndex, switchMode, getActiveEditor } = useEditorManager()

// Mode and theme labels (reactive for language switching).
const modeLabels = computed<Record<string, string>>(() => ({
  wysiwyg: t('statusbar.modeWysiwyg'),
  source: t('statusbar.modeSource'),
  split: t('statusbar.modeSplit'),
}))

const themeLabels = computed<Record<string, string>>(() => ({
  light: t('statusbar.themeLight'),
  dark: t('statusbar.themeDark'),
  system: t('statusbar.themeSystem'),
}))

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

// Breadcrumb: compute the heading ancestry for the current cursor position.
const breadcrumb = computed(() => {
  const headings = parseHeadings(content.value)
  if (headings.length === 0) return []

  const activeIdx = activeHeadingIndex.value
  if (activeIdx < 0 || activeIdx >= headings.length) return []

  // Walk backwards to build the ancestry path.
  const path: { text: string; line: number }[] = []
  let currentLevel = headings[activeIdx].level
  path.unshift({ text: headings[activeIdx].text, line: headings[activeIdx].line })

  for (let i = activeIdx - 1; i >= 0; i--) {
    if (headings[i].level < currentLevel) {
      path.unshift({ text: headings[i].text, line: headings[i].line })
      currentLevel = headings[i].level
      if (currentLevel === 1) break
    }
  }
  return path
})

function jumpToBreadcrumb(line: number) {
  const editor = getActiveEditor()
  if (!editor) return
  // Find the heading index by matching its line number.
  const headings = parseHeadings(content.value)
  const headingIdx = headings.findIndex(h => h.line === line)
  if (headingIdx >= 0) {
    editor.jumpToHeading(headingIdx)
  } else {
    editor.setCursorPosition({ line, column: 0, offset: 0 })
  }
  editor.focus()
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
      <span class="statusbar-item">{{ wordCount.lines }} {{ t('statusbar.lines') }}</span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item">{{ wordCount.words }} {{ t('statusbar.words') }}</span>
      <template v-if="breadcrumb.length > 0">
        <span class="statusbar-sep">|</span>
        <span class="statusbar-breadcrumb">
          <template v-for="(crumb, idx) in breadcrumb" :key="idx">
            <span v-if="idx > 0" class="breadcrumb-sep">&rsaquo;</span>
            <span class="breadcrumb-item" @click="jumpToBreadcrumb(crumb.line)">{{ crumb.text }}</span>
          </template>
        </span>
      </template>
    </div>
    <div class="statusbar-right">
      <span class="statusbar-item">{{ t('statusbar.ln') }} {{ cursor.line + 1 }}, {{ t('statusbar.col') }} {{ cursor.column + 1 }}</span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item statusbar-clickable" @click="handleModeClick" :title="t('statusbar.switchMode')">
        {{ modeLabels[mode] }}
      </span>
      <span class="statusbar-sep">|</span>
      <span class="statusbar-item statusbar-clickable" @click="handleThemeClick" :title="t('statusbar.switchTheme')">
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

.statusbar-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow: hidden;
  max-width: 300px;
}

.breadcrumb-sep {
  color: var(--text-muted);
  opacity: 0.6;
  font-size: 10px;
}

.breadcrumb-item {
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
  padding: 1px 3px;
  border-radius: 2px;
}

.breadcrumb-item:hover {
  background: var(--bg-hover);
  color: var(--accent-primary);
}
</style>
