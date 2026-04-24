<script setup lang="ts">
/**
 * FindReplacePanel — 查找/替换浮层
 *
 * 三种编辑模式（WYSIWYG / Source / Split）共用此面板。
 * 实际查找逻辑由父级传入的 editorManager 代理到当前激活编辑器。
 *
 * 交互：
 * - 实时搜索（debounce 200ms）
 * - Enter: 下一个；Shift+Enter: 上一个
 * - Ctrl+Enter: 替换当前；Ctrl+Shift+Enter: 全部替换
 * - Esc: 关闭
 * - mode='find' 时隐藏替换行；mode='replace' 时显示
 */

import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SearchOptions, SearchState } from '../../core/editor/types'
import { useEditorManager } from '../../core/editor/EditorManager'

// 会话内位置记忆（不持久化到磁盘）
// 组件卸载后下次打开使用这里保存的坐标；null = 使用默认居中位置
interface PanelRect {
  left: number
  top: number
  width: number
}
let savedRect: PanelRect | null = null

const MIN_WIDTH = 360
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 480
const EDGE_MARGIN = 8 // 与父容器边缘的最小距离

const props = defineProps<{
  mode: 'find' | 'replace'
}>()

const emit = defineEmits<{
  close: []
  modeChange: [mode: 'find' | 'replace']
}>()

const { t } = useI18n()
const em = useEditorManager()

const query = ref('')
const replacement = ref('')
const options = ref<SearchOptions>({
  caseSensitive: false,
  wholeWord: false,
  regex: false,
})
const state = ref<SearchState>({ total: 0, current: 0 })

const findInputRef = ref<HTMLInputElement | null>(null)
const replaceInputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

// 位置/尺寸状态（响应式，用于 inline style）
const left = ref(0)
const top = ref(16)
const width = ref(DEFAULT_WIDTH)

const showReplace = computed(() => props.mode === 'replace')

// ---- Search debounce ----
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    state.value = em.searchInEditor(query.value, options.value)
  }, 200)
}

watch(query, scheduleSearch)
watch(options, scheduleSearch, { deep: true })

// 模式切换（find ↔ replace）时，若已有查询则重新聚焦对应输入框
watch(
  () => props.mode,
  (m) => {
    nextTick(() => {
      if (m === 'replace') {
        replaceInputRef.value?.focus()
      } else {
        findInputRef.value?.focus()
      }
    })
  },
)

// ---- Actions ----
function gotoNext() {
  if (!query.value) return
  state.value = em.gotoNextMatch()
}

function gotoPrev() {
  if (!query.value) return
  state.value = em.gotoPrevMatch()
}

function doReplaceOne() {
  if (!query.value || state.value.total === 0) return
  state.value = em.replaceNextInEditor(replacement.value)
}

function doReplaceAll() {
  if (!query.value || state.value.total === 0) return
  em.replaceAllInEditor(replacement.value)
  // 替换后刷新状态
  state.value = em.searchInEditor(query.value, options.value)
}

function toggleOption(key: keyof SearchOptions) {
  options.value = { ...options.value, [key]: !options.value[key] }
}

function close() {
  em.clearSearch()
  emit('close')
}

// ---- Keyboard handling (只响应面板内按键) ----
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()

    // 在替换输入框里且按下 Ctrl/Meta → 替换动作
    if (showReplace.value && (e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) {
        doReplaceAll()
      } else {
        doReplaceOne()
      }
      return
    }

    if (e.shiftKey) {
      gotoPrev()
    } else {
      gotoNext()
    }
    return
  }
}

// ---- 状态显示 ----
const statusText = computed(() => {
  if (state.value.error) {
    return t('findReplace.regexError')
  }
  if (!query.value) return ''
  if (state.value.total === 0) {
    return t('findReplace.noMatches')
  }
  return t('findReplace.matchCount', {
    current: state.value.current,
    total: state.value.total,
  })
})

const hasError = computed(() => !!state.value.error)

// ---- 位置计算辅助 ----
function getParentRect(): DOMRect | null {
  const parent = panelRef.value?.offsetParent as HTMLElement | null
  return parent?.getBoundingClientRect() ?? null
}

/** 应用默认居中位置 */
function applyDefaultPosition() {
  const parent = getParentRect()
  if (!parent) {
    left.value = 0
    top.value = 16
    width.value = DEFAULT_WIDTH
    return
  }
  width.value = Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, parent.width - EDGE_MARGIN * 2))
  left.value = Math.max(EDGE_MARGIN, (parent.width - width.value) / 2)
  top.value = 16
}

/** 把 left/top/width 夹紧到父容器可视范围内 */
function clampRect() {
  const parent = getParentRect()
  const panelEl = panelRef.value
  if (!parent || !panelEl) return
  const h = panelEl.offsetHeight || 0

  width.value = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width.value))
  const maxLeft = Math.max(EDGE_MARGIN, parent.width - width.value - EDGE_MARGIN)
  const maxTop = Math.max(EDGE_MARGIN, parent.height - h - EDGE_MARGIN)
  left.value = Math.max(EDGE_MARGIN, Math.min(left.value, maxLeft))
  top.value = Math.max(EDGE_MARGIN, Math.min(top.value, maxTop))
}

// ---- 拖拽 ----
let dragOrigin: { mouseX: number; mouseY: number; left: number; top: number } | null = null

function onDragStart(e: MouseEvent) {
  // 只接受左键
  if (e.button !== 0) return
  // 忽略输入框/按钮/其他可交互元素
  const target = e.target as HTMLElement
  if (target.closest('input, button, textarea, select')) return
  dragOrigin = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    left: left.value,
    top: top.value,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent) {
  if (!dragOrigin) return
  left.value = dragOrigin.left + (e.clientX - dragOrigin.mouseX)
  top.value = dragOrigin.top + (e.clientY - dragOrigin.mouseY)
  clampRect()
}

function onDragEnd() {
  dragOrigin = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}

// ---- Resize（右下角把手，只调宽度） ----
let resizeOrigin: { mouseX: number; width: number } | null = null

function onResizeStart(e: MouseEvent) {
  if (e.button !== 0) return
  resizeOrigin = { mouseX: e.clientX, width: width.value }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
  e.stopPropagation()
}

function onResizeMove(e: MouseEvent) {
  if (!resizeOrigin) return
  width.value = resizeOrigin.width + (e.clientX - resizeOrigin.mouseX)
  clampRect()
}

function onResizeEnd() {
  resizeOrigin = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

// ---- Lifecycle ----
onMounted(() => {
  nextTick(() => {
    // 恢复上次位置或使用默认居中
    if (savedRect) {
      left.value = savedRect.left
      top.value = savedRect.top
      width.value = savedRect.width
      clampRect()
    } else {
      applyDefaultPosition()
    }
    findInputRef.value?.focus()
    findInputRef.value?.select()
  })
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  // 保存位置供下次打开使用
  savedRect = {
    left: left.value,
    top: top.value,
    width: width.value,
  }
  // 清理可能未释放的全局监听
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  em.clearSearch()
})

// 暴露 focus 方法给父组件（Ctrl+F 再次按下时聚焦输入框）
defineExpose({
  focus: () => {
    nextTick(() => {
      findInputRef.value?.focus()
      findInputRef.value?.select()
    })
  },
  setMode: (m: 'find' | 'replace') => emit('modeChange', m),
})
</script>

<template>
  <div
    ref="panelRef"
    class="fr-panel"
    role="dialog"
    :aria-label="t('findReplace.find')"
    :style="{ left: left + 'px', top: top + 'px', width: width + 'px' }"
    @keydown="handleKeydown"
    @mousedown="onDragStart"
  >
    <!-- 顶部拖拽把手条 -->
    <div class="fr-drag-handle" :title="t('findReplace.find')"></div>

    <!-- 查找行 -->
    <div class="fr-row">
      <input
        ref="findInputRef"
        v-model="query"
        class="fr-input"
        :class="{ 'fr-input-error': hasError }"
        :placeholder="t('findReplace.findPlaceholder')"
        spellcheck="false"
      />

      <!-- 状态 -->
      <span class="fr-status" :class="{ 'fr-status-error': hasError }">
        {{ statusText }}
      </span>

      <!-- 选项切换 -->
      <button
        type="button"
        class="fr-icon-btn"
        :class="{ 'fr-icon-btn-active': options.caseSensitive }"
        :title="t('findReplace.caseSensitive')"
        @click="toggleOption('caseSensitive')"
      >
        Aa
      </button>
      <button
        type="button"
        class="fr-icon-btn"
        :class="{ 'fr-icon-btn-active': options.wholeWord }"
        :title="t('findReplace.wholeWord')"
        @click="toggleOption('wholeWord')"
      >
        Ab
      </button>
      <button
        type="button"
        class="fr-icon-btn"
        :class="{ 'fr-icon-btn-active': options.regex }"
        :title="t('findReplace.regex')"
        @click="toggleOption('regex')"
      >
        .*
      </button>

      <!-- 导航 -->
      <button type="button" class="fr-icon-btn" :title="t('findReplace.previous')" @click="gotoPrev">
        ↑
      </button>
      <button type="button" class="fr-icon-btn" :title="t('findReplace.next')" @click="gotoNext">
        ↓
      </button>

      <!-- 关闭 -->
      <button type="button" class="fr-icon-btn fr-close-btn" :title="t('findReplace.close')" @click="close">
        ×
      </button>
    </div>

    <!-- 替换行 -->
    <div v-if="showReplace" class="fr-row">
      <input
        ref="replaceInputRef"
        v-model="replacement"
        class="fr-input"
        :placeholder="t('findReplace.replacePlaceholder')"
        spellcheck="false"
      />
      <button type="button" class="fr-btn" @click="doReplaceOne">
        {{ t('findReplace.replaceOne') }}
      </button>
      <button type="button" class="fr-btn" @click="doReplaceAll">
        {{ t('findReplace.replaceAll') }}
      </button>
    </div>

    <!-- 右下角 resize 把手 -->
    <div class="fr-resize-handle" @mousedown="onResizeStart"></div>
  </div>
</template>

<style scoped>
.fr-panel {
  position: absolute;
  /* left / top / width 由 inline style 动态设置 */
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 0 8px 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 360px;
  max-width: 900px;
  user-select: none;
}

/* 顶部拖拽把手条（4px 高，视觉上是一条浅色条带） */
.fr-drag-handle {
  height: 8px;
  margin: 0 -8px 2px -8px;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  cursor: grab;
  background: linear-gradient(
    to bottom,
    var(--bg-secondary),
    transparent
  );
  border-bottom: 1px solid var(--border-primary);
}

.fr-drag-handle:active {
  cursor: grabbing;
}

/* 右下角 resize 把手 */
.fr-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: ew-resize;
  /* 用一个简单的小三角提示 */
  background: linear-gradient(
    135deg,
    transparent 0%,
    transparent 50%,
    var(--text-muted) 50%,
    var(--text-muted) 60%,
    transparent 60%,
    transparent 75%,
    var(--text-muted) 75%,
    var(--text-muted) 85%,
    transparent 85%
  );
  border-bottom-right-radius: 6px;
  opacity: 0.6;
}

.fr-resize-handle:hover {
  opacity: 1;
}

.fr-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.fr-input {
  flex: 1;
  min-width: 160px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  user-select: text;
}

.fr-input:focus {
  border-color: var(--accent-primary);
}

.fr-input-error {
  border-color: #ef4444;
}

.fr-input::placeholder {
  color: var(--text-muted);
}

.fr-status {
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.fr-status-error {
  color: #ef4444;
}

.fr-icon-btn {
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.fr-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.fr-icon-btn-active {
  background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 40%, transparent);
}

.fr-close-btn {
  font-size: 16px;
  margin-left: 2px;
}

.fr-btn {
  height: 24px;
  padding: 0 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.fr-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}
</style>
