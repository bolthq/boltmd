<script setup lang="ts">
/**
 * FindReplacePanel — find/replace floating panel.
 *
 * Shared by all three editor modes (WYSIWYG / Source / Split).
 * Actual search work is delegated to the active editor through EditorManager.
 *
 * Interactions:
 * - Live search (200ms debounce)
 * - Enter: next; Shift+Enter: previous
 * - Ctrl+Enter: replace one; Ctrl+Shift+Enter: replace all
 * - Esc: close
 * - mode='find' hides the replace row; mode='replace' shows it
 *
 * Layout (VSCode-inspired):
 * - Each row is a flex container: [fixed col] [flex:1 input-wrapper] [fixed buttons]
 * - Option buttons (Aa / Ab / .*) are absolutely positioned on top of the find
 *   input's right edge, with the input's padding-right reserving space.
 * - This way the input never shrinks below its flex:1 share, buttons never wrap,
 *   and both rows' inputs share the same left/right edges.
 */

import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SearchOptions, SearchState } from '../../core/editor/types'
import { useEditorManager } from '../../core/editor/EditorManager'

// Session-only position memory (not persisted).
interface PanelRect {
  left: number
  top: number
  width: number
}
let savedRect: PanelRect | null = null

const MIN_WIDTH = 360
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 480
const EDGE_MARGIN = 8

const props = defineProps<{
  mode: 'find' | 'replace'
  // Optional value that should overwrite the current find input when the
  // panel opens. Used to prefill the input with the editor's current
  // single-line selection. Empty string / undefined leaves the existing
  // query untouched (useful for re-opens where the user expects history).
  initialQuery?: string
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
  state.value = em.searchInEditor(query.value, options.value)
}

function toggleOption(key: keyof SearchOptions) {
  options.value = { ...options.value, [key]: !options.value[key] }
}

function toggleMode() {
  emit('modeChange', showReplace.value ? 'find' : 'replace')
}

function close() {
  em.clearSearch()
  emit('close')
}

// ---- Keyboard handling (panel-scoped) ----
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

// ---- Status text ----
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

// ---- Position helpers ----
function getParentRect(): DOMRect | null {
  const parent = panelRef.value?.offsetParent as HTMLElement | null
  return parent?.getBoundingClientRect() ?? null
}

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

// ---- Drag ----
let dragOrigin: { mouseX: number; mouseY: number; left: number; top: number } | null = null

function onDragStart(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('input, button, textarea, select, .fr-resize-edge')) return
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

// ---- Resize (left/right edges, width only, VSCode-style) ----
let resizeOrigin:
  | { mouseX: number; width: number; left: number; side: 'left' | 'right' }
  | null = null

function onResizeStart(e: MouseEvent, side: 'left' | 'right') {
  if (e.button !== 0) return
  resizeOrigin = {
    mouseX: e.clientX,
    width: width.value,
    left: left.value,
    side,
  }
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
  e.stopPropagation()
}

function onResizeMove(e: MouseEvent) {
  if (!resizeOrigin) return
  const dx = e.clientX - resizeOrigin.mouseX
  if (resizeOrigin.side === 'right') {
    width.value = resizeOrigin.width + dx
  } else {
    const newWidth = resizeOrigin.width - dx
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    const actualDx = resizeOrigin.width - clampedWidth
    width.value = clampedWidth
    left.value = resizeOrigin.left + actualDx
  }
  clampRect()
}

function onResizeEnd() {
  resizeOrigin = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
}

// ---- Lifecycle ----
onMounted(() => {
  // Prefill with the editor's current selection when the opener passes one.
  // Non-empty value always wins over any stale `query` state; empty string
  // means "no prefill requested" and leaves `query` (typically '') alone.
  if (props.initialQuery) {
    query.value = props.initialQuery
  }
  nextTick(() => {
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
  savedRect = {
    left: left.value,
    top: top.value,
    width: width.value,
  }
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', onResizeEnd)
  em.clearSearch()
})

defineExpose({
  focus: (prefill?: string) => {
    // Re-opens while already mounted: let the caller overwrite the query
    // with a fresh selection if one was provided.
    if (prefill) {
      query.value = prefill
    }
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
    <!-- Invisible edge resize strips -->
    <div class="fr-resize-edge fr-resize-edge-left" @mousedown="(e) => onResizeStart(e, 'left')"></div>
    <div class="fr-resize-edge fr-resize-edge-right" @mousedown="(e) => onResizeStart(e, 'right')"></div>

    <!-- Mode toggle button: spans both rows when replace is shown -->
    <button
      type="button"
      class="fr-mode-toggle"
      :class="{ 'fr-mode-toggle-tall': showReplace }"
      :title="showReplace ? t('findReplace.find') : t('findReplace.replace')"
      @click="toggleMode"
    >
      {{ showReplace ? '▾' : '▸' }}
    </button>

    <!-- Grid area holding both rows. Column widths are determined by row 2's
         text buttons (Replace / Replace All), so row 1's trailing group auto-
         matches — inputs end up exactly the same width on both rows. -->
    <div class="fr-grid" :class="{ 'fr-grid-replace': showReplace }">
      <!-- Row 1: find -->
      <div class="fr-input-wrap fr-cell-input">
        <input
          ref="findInputRef"
          v-model="query"
          class="fr-input fr-input-find"
          :class="{ 'fr-input-error': hasError }"
          :placeholder="t('findReplace.findPlaceholder')"
          spellcheck="false"
        />
        <div class="fr-input-overlay">
          <button
            type="button"
            class="fr-icon-btn fr-icon-btn-sm"
            :class="{ 'fr-icon-btn-active': options.caseSensitive }"
            :title="t('findReplace.caseSensitive')"
            @click="toggleOption('caseSensitive')"
          >
            Aa
          </button>
          <button
            type="button"
            class="fr-icon-btn fr-icon-btn-sm"
            :class="{ 'fr-icon-btn-active': options.wholeWord }"
            :title="t('findReplace.wholeWord')"
            @click="toggleOption('wholeWord')"
          >
            Ab
          </button>
          <button
            type="button"
            class="fr-icon-btn fr-icon-btn-sm"
            :class="{ 'fr-icon-btn-active': options.regex }"
            :title="t('findReplace.regex')"
            @click="toggleOption('regex')"
          >
            .*
          </button>
        </div>
      </div>

      <div class="fr-cell-trailing">
        <span class="fr-status" :class="{ 'fr-status-error': hasError }">
          {{ statusText }}
        </span>
        <button type="button" class="fr-icon-btn fr-nav-btn" :title="t('findReplace.previous')" @click="gotoPrev">
          ↑
        </button>
        <button type="button" class="fr-icon-btn fr-nav-btn" :title="t('findReplace.next')" @click="gotoNext">
          ↓
        </button>
      </div>

      <button type="button" class="fr-icon-btn fr-close-btn fr-cell-close" :title="t('findReplace.close')" @click="close">
        ×
      </button>

      <!-- Row 2: replace -->
      <template v-if="showReplace">
        <div class="fr-input-wrap fr-cell-input-r2">
          <input
            ref="replaceInputRef"
            v-model="replacement"
            class="fr-input"
            :placeholder="t('findReplace.replacePlaceholder')"
            spellcheck="false"
          />
        </div>

        <div class="fr-cell-trailing fr-cell-trailing-r2">
          <!-- Empty spacer with same width as row 1's status so both trailing
               groups occupy exactly the same width; the two action buttons
               align under row 1's ↑ / ↓ buttons. -->
          <span class="fr-status" aria-hidden="true"></span>
          <button
            type="button"
            class="fr-icon-btn fr-nav-btn"
            :title="t('findReplace.replaceOne')"
            @click="doReplaceOne"
          >
            ↪
          </button>
          <button
            type="button"
            class="fr-icon-btn fr-nav-btn"
            :title="t('findReplace.replaceAll')"
            @click="doReplaceAll"
          >
            ↯
          </button>
        </div>

        <!-- Spacer to keep close column width in row 2 (empty cell) -->
        <span class="fr-cell-close-r2" aria-hidden="true"></span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fr-panel {
  position: absolute;
  z-index: 50;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 6px 8px;
  /* Outer flex: [toggle button] [grid with both rows] */
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 4px;
  min-width: 360px;
  max-width: 900px;
  user-select: none;
  cursor: grab;
}

.fr-panel:active {
  cursor: grabbing;
}

.fr-panel input,
.fr-panel textarea {
  cursor: text;
}
.fr-panel button {
  cursor: pointer;
}

/* Mode toggle: short (row 1 only) by default, tall (spans both rows) in
   replace mode. */
.fr-mode-toggle {
  flex: 0 0 20px;
  width: 20px;
  min-width: 20px;
  height: 26px;
  padding: 0;
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  align-self: flex-start;
}

.fr-mode-toggle-tall {
  /* 2 × 26px rows + 4px row-gap = 56px */
  height: 56px;
}

.fr-mode-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Inner grid: 3 columns, 1 or 2 rows. Column widths follow content so row 2's
   text buttons (Replace / Replace All) drive the trailing column width. */
.fr-grid {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto auto;
  column-gap: 4px;
  row-gap: 4px;
  align-items: center;
}

.fr-grid-replace {
  grid-template-rows: 26px 26px;
}

/* Column 1: input wrapper, takes all leftover space */
.fr-input-wrap {
  position: relative;
  height: 24px;
  min-width: 0;
}

.fr-cell-input        { grid-column: 1; grid-row: 1; }
.fr-cell-trailing     { grid-column: 2; grid-row: 1; }
.fr-cell-close        { grid-column: 3; grid-row: 1; }
.fr-cell-input-r2     { grid-column: 1; grid-row: 2; }
.fr-cell-trailing-r2  { grid-column: 2; grid-row: 2; }
.fr-cell-close-r2     { grid-column: 3; grid-row: 2; }

/* Trailing groups are flex rows of icons/buttons; their width auto-sizes from
   content, which ties both rows' trailing columns to the SAME width. */
.fr-cell-trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
}

.fr-cell-trailing-r2 {
  /* Same layout as row 1's trailing (spacer + 2 icons), so column 2 width is
     identical on both rows → input column stays the same width when the
     replace row is toggled. */
}

/* Invisible 6px hot zones on left/right edges for resize */
.fr-resize-edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 1;
}

.fr-resize-edge-left  { left: 0; }
.fr-resize-edge-right { right: 0; }

.fr-input {
  width: 100%;
  height: 100%;
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

/* Find input reserves space on its right for the overlayed option buttons */
.fr-input-find {
  padding-right: 84px;       /* room for Aa + Ab + .* (3 × ~24px + gaps) */
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

/* Options overlay sitting on top of the find input's right edge */
.fr-input-overlay {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}

.fr-input-overlay > * {
  pointer-events: auto;
}

.fr-status {
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  min-width: 3em;
  text-align: right;
}

.fr-status-error {
  color: #ef4444;
}

.fr-icon-btn {
  flex: 0 0 auto;
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

/* Smaller option buttons that fit inside the input overlay */
.fr-icon-btn-sm {
  height: 20px;
  min-width: 22px;
  padding: 0 4px;
  font-size: 11px;
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

.fr-nav-btn {
  width: 24px;
  min-width: 24px;
  padding: 0;
}

.fr-close-btn {
  width: 24px;
  min-width: 24px;
  padding: 0;
  font-size: 16px;
}
</style>
