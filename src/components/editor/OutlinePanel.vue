<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorManager } from '../../core/editor/EditorManager'
import { parseHeadings, type HeadingItem } from '../../core/services/OutlineService'

const { content, cursorLine, getActiveEditor } = useEditorManager()
const { t } = useI18n()

// Debounced headings: re-parse only after 300ms of inactivity.
const headings = ref<HeadingItem[]>(parseHeadings(content.value))
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(content, (md) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    headings.value = parseHeadings(md)
  }, 300)
}, { immediate: false })

// Collapse state: set of heading indices that are collapsed.
const collapsed = ref<Set<number>>(new Set())

/** Whether a heading at `index` has children (subsequent headings with deeper level). */
function hasChildren(index: number): boolean {
  const list = headings.value
  if (index >= list.length - 1) return false
  return list[index + 1].level > list[index].level
}

/** Toggle collapsed state for a heading. */
function toggleCollapse(index: number): void {
  const s = new Set(collapsed.value)
  if (s.has(index)) {
    s.delete(index)
  } else {
    s.add(index)
  }
  collapsed.value = s
}

/** Determine which headings are visible (not hidden by a collapsed parent). */
const visibleIndices = computed(() => {
  const list = headings.value
  const result: number[] = []
  let i = 0
  while (i < list.length) {
    result.push(i)
    if (collapsed.value.has(i)) {
      // Skip all children (level > current level)
      const parentLevel = list[i].level
      i++
      while (i < list.length && list[i].level > parentLevel) {
        i++
      }
    } else {
      i++
    }
  }
  return result
})

/** Index of the heading that contains the current cursor position. */
const activeIndex = computed(() => {
  const line = cursorLine.value // 1-based
  const list = headings.value
  if (list.length === 0) return -1
  // Find the last heading whose line is <= current cursor line.
  // headings[].line is 0-based, cursorLine is 1-based.
  let idx = -1
  for (let i = 0; i < list.length; i++) {
    if (list[i].line + 1 <= line) {
      idx = i
    } else {
      break
    }
  }
  return idx
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

/** Jump the editor cursor to the given heading's line. */
function jumpToHeading(item: HeadingItem): void {
  const editor = getActiveEditor()
  if (!editor) return
  // line is 0-based from OutlineService; setCursorPosition expects 1-based line.
  editor.setCursorPosition({ line: item.line + 1, column: 0, offset: 0 })
  editor.focus()
}
</script>

<template>
  <aside class="outline-panel">
    <div class="outline-header">
      <span class="outline-title">{{ t('outline.title') }}</span>
      <button class="outline-close" @click="emit('close')" :title="t('outline.close')">&times;</button>
    </div>
    <div class="outline-body">
      <template v-if="headings.length > 0">
        <div
          v-for="idx in visibleIndices"
          :key="idx"
          class="outline-item"
          :class="[`outline-level-${headings[idx].level}`, { 'outline-active': idx === activeIndex }]"
          :title="headings[idx].text"
          @click="jumpToHeading(headings[idx])"
        >
          <span
            class="outline-toggle"
            :class="{ 'has-children': hasChildren(idx) }"
            @click.stop="hasChildren(idx) && toggleCollapse(idx)"
          >
            <template v-if="hasChildren(idx)">{{ collapsed.has(idx) ? '▸' : '▾' }}</template>
          </span>
          <span class="outline-item-text">{{ headings[idx].text }}</span>
        </div>
      </template>
      <div v-else class="outline-empty">
        {{ t('outline.empty') }}
      </div>
    </div>
  </aside>
</template>

<style scoped>
.outline-panel {
  width: 220px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  overflow: hidden;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-primary);
  user-select: none;
}

.outline-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.outline-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 3px;
}

.outline-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.outline-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.outline-item {
  display: flex;
  align-items: center;
  padding: 3px 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 3px;
  margin: 0 4px;
}

.outline-item:hover {
  background: var(--bg-hover);
}

.outline-active {
  background: var(--bg-hover);
  color: var(--accent-primary);
  font-weight: 500;
}

.outline-toggle {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  user-select: none;
}

.outline-toggle.has-children {
  cursor: pointer;
}

.outline-toggle.has-children:hover {
  color: var(--text-primary);
}

.outline-item-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Indent by heading level (accounting for toggle width) */
.outline-level-1 { padding-left: 4px; font-weight: 600; }
.outline-level-2 { padding-left: 16px; }
.outline-level-3 { padding-left: 28px; }
.outline-level-4 { padding-left: 40px; }
.outline-level-5 { padding-left: 52px; }
.outline-level-6 { padding-left: 64px; }

.outline-empty {
  padding: 16px 10px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
</style>
