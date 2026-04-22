<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'
import { configService } from '../../core/services/ConfigService'
import { themeService } from '../../core/services/ThemeService'
import type { ThemeName } from '../../core/types/config'
import type { EditorMode } from '../../core/editor/types'

const emit = defineEmits<{
  close: []
}>()

// 本地状态（从 ConfigService 读取初始值）
const theme = ref<ThemeName>(configService.get('theme'))
const fontSize = ref(configService.get('fontSize'))
const fontFamily = ref(configService.get('fontFamily'))
const lineHeight = ref(configService.get('lineHeight'))
const tabSize = ref(configService.get('tabSize'))
const wordWrap = ref(configService.get('wordWrap'))
const autoSave = ref(configService.get('autoSave'))
const autoSaveDelay = ref(configService.get('autoSaveDelay'))
const defaultMode = ref<EditorMode>(configService.get('defaultMode'))
const showLineNumbers = ref(configService.get('showLineNumbers'))

// 变更处理器
function updateTheme(value: ThemeName) {
  theme.value = value
  themeService.setTheme(value)
}

async function updateFontSize(value: number) {
  fontSize.value = value
  await configService.set('fontSize', value)
}

async function updateFontFamily(value: string) {
  fontFamily.value = value
  await configService.set('fontFamily', value)
}

async function updateLineHeight(value: number) {
  lineHeight.value = value
  await configService.set('lineHeight', value)
}

async function updateTabSize(value: number) {
  tabSize.value = value
  await configService.set('tabSize', value)
}

async function updateWordWrap(value: boolean) {
  wordWrap.value = value
  await configService.set('wordWrap', value)
}

async function updateAutoSave(value: boolean) {
  autoSave.value = value
  await configService.set('autoSave', value)
}

async function updateAutoSaveDelay(value: number) {
  autoSaveDelay.value = value
  await configService.set('autoSaveDelay', value)
}

async function updateDefaultMode(value: EditorMode) {
  defaultMode.value = value
  await configService.set('defaultMode', value)
}

async function updateShowLineNumbers(value: boolean) {
  showLineNumbers.value = value
  await configService.set('showLineNumbers', value)
}

// 快捷键列表
const shortcuts = [
  { keys: 'Ctrl+N', desc: 'New tab' },
  { keys: 'Ctrl+O', desc: 'Open file' },
  { keys: 'Ctrl+S', desc: 'Save file' },
  { keys: 'Ctrl+W', desc: 'Close tab' },
  { keys: 'Ctrl+/', desc: 'Cycle editor mode' },
  { keys: 'Ctrl+Shift+T', desc: 'Toggle toolbar' },
  { keys: 'Ctrl+,', desc: 'Settings' },
  { keys: 'Ctrl+Tab', desc: 'Next tab' },
  { keys: 'Ctrl+Shift+Tab', desc: 'Previous tab' },
  { keys: 'Ctrl+1~9', desc: 'Jump to tab' },
]

// 点击遮罩关闭
function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('settings-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <div class="settings-overlay" @click="handleOverlayClick">
    <div class="settings-panel">
      <!-- 头部 -->
      <div class="settings-header">
        <h2 class="settings-title">Settings</h2>
        <button class="settings-close" @click="emit('close')" title="Close">
          <X :size="16" />
        </button>
      </div>

      <!-- 内容 -->
      <div class="settings-body">
        <!-- 外观 -->
        <section class="settings-section">
          <h3 class="settings-section-title">Appearance</h3>

          <div class="settings-row">
            <label class="settings-label">Theme</label>
            <select class="settings-select" :value="theme" @change="updateTheme(($event.target as HTMLSelectElement).value as ThemeName)">
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <div class="settings-row">
            <label class="settings-label">Default Mode</label>
            <select class="settings-select" :value="defaultMode" @change="updateDefaultMode(($event.target as HTMLSelectElement).value as EditorMode)">
              <option value="wysiwyg">WYSIWYG</option>
              <option value="source">Source</option>
              <option value="split">Split</option>
            </select>
          </div>
        </section>

        <!-- 编辑器 -->
        <section class="settings-section">
          <h3 class="settings-section-title">Editor</h3>

          <div class="settings-row">
            <label class="settings-label">Font Size</label>
            <input class="settings-input" type="number" :value="fontSize" min="10" max="32" @change="updateFontSize(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <label class="settings-label">Font Family</label>
            <input class="settings-input settings-input-wide" type="text" :value="fontFamily" @change="updateFontFamily(($event.target as HTMLInputElement).value)" />
          </div>

          <div class="settings-row">
            <label class="settings-label">Line Height</label>
            <input class="settings-input" type="number" :value="lineHeight" min="1.0" max="3.0" step="0.1" @change="updateLineHeight(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <label class="settings-label">Tab Size</label>
            <input class="settings-input" type="number" :value="tabSize" min="1" max="8" @change="updateTabSize(Number(($event.target as HTMLInputElement).value))" />
          </div>

          <div class="settings-row">
            <label class="settings-label">Word Wrap</label>
            <input class="settings-checkbox" type="checkbox" :checked="wordWrap" @change="updateWordWrap(($event.target as HTMLInputElement).checked)" />
          </div>

          <div class="settings-row">
            <label class="settings-label">Line Numbers</label>
            <input class="settings-checkbox" type="checkbox" :checked="showLineNumbers" @change="updateShowLineNumbers(($event.target as HTMLInputElement).checked)" />
          </div>
        </section>

        <!-- 文件 -->
        <section class="settings-section">
          <h3 class="settings-section-title">File</h3>

          <div class="settings-row">
            <label class="settings-label">Auto Save</label>
            <input class="settings-checkbox" type="checkbox" :checked="autoSave" @change="updateAutoSave(($event.target as HTMLInputElement).checked)" />
          </div>

          <div class="settings-row" v-if="autoSave">
            <label class="settings-label">Auto Save Delay</label>
            <div class="settings-input-group">
              <input class="settings-input" type="number" :value="autoSaveDelay" min="500" max="30000" step="500" @change="updateAutoSaveDelay(Number(($event.target as HTMLInputElement).value))" />
              <span class="settings-unit">ms</span>
            </div>
          </div>
        </section>

        <!-- 快捷键 -->
        <section class="settings-section">
          <h3 class="settings-section-title">Keyboard Shortcuts</h3>
          <div class="shortcuts-list">
            <div class="shortcut-row" v-for="s in shortcuts" :key="s.keys">
              <kbd class="shortcut-key">{{ s.keys }}</kbd>
              <span class="shortcut-desc">{{ s.desc }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 60px;
  z-index: 1000;
}

.settings-panel {
  width: 480px;
  max-height: calc(100vh - 120px);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.settings-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-body {
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  min-height: 32px;
}

.settings-label {
  font-size: 13px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.settings-select,
.settings-input {
  padding: 4px 8px;
  font-size: 13px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  outline: none;
  font-family: inherit;
}

.settings-select:focus,
.settings-input:focus {
  border-color: var(--accent-primary);
}

.settings-input {
  width: 80px;
  text-align: right;
}

.settings-input-wide {
  width: 200px;
  text-align: left;
}

.settings-input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.settings-unit {
  font-size: 12px;
  color: var(--text-muted);
}

.settings-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.shortcut-key {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 3px;
  color: var(--text-primary);
}

.shortcut-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
