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

// ---- Lifecycle ----
onMounted(() => {
  nextTick(() => {
    findInputRef.value?.focus()
    findInputRef.value?.select()
  })
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
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
  <div class="fr-panel" role="dialog" :aria-label="t('findReplace.find')" @keydown="handleKeydown">
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
  </div>
</template>

<style scoped>
.fr-panel {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 允许水平拉伸；高度由内容决定 */
  resize: horizontal;
  overflow: auto;
  width: 480px;
  min-width: 360px;
  max-width: 900px;
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
