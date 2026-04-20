<script setup lang="ts">
import { ref } from 'vue'
import { tabs, activeTabId, switchTab, closeTab, moveTab } from '../../core/stores/tabStore'

function handleClose(e: MouseEvent, tabId: string) {
  e.stopPropagation()
  closeTab(tabId)
}

function handleMouseDown(e: MouseEvent, tabId: string) {
  // 中键点击关闭
  if (e.button === 1) {
    e.preventDefault()
    closeTab(tabId)
  }
}

// ── 拖拽排序 ─────────────────────────────────────────────────────────────────

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function handleDragStart(e: DragEvent, index: number) {
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  dropIndex.value = index
}

function handleDragLeave() {
  dropIndex.value = null
}

function handleDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    moveTab(dragIndex.value, index)
  }
  dragIndex.value = null
  dropIndex.value = null
}

function handleDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}
</script>

<template>
  <div class="tab-bar">
    <div class="tab-list">
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === activeTabId, 'drop-target': dropIndex === index }"
        draggable="true"
        @click="switchTab(tab.id)"
        @mousedown="handleMouseDown($event, tab.id)"
        @dragstart="handleDragStart($event, index)"
        @dragover="handleDragOver($event, index)"
        @dragleave="handleDragLeave"
        @drop="handleDrop($event, index)"
        @dragend="handleDragEnd"
      >
        <span class="tab-name">{{ tab.fileName }}</span>
        <span v-if="tab.dirty" class="tab-dirty">●</span>
        <button class="tab-close" @click="handleClose($event, tab.id)">&times;</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
  height: 36px;
}

.tab-list {
  display: flex;
  align-items: stretch;
  min-width: 0;
  flex: 1;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
  border-right: 1px solid var(--border-primary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  max-width: 180px;
  min-width: 80px;
}

.tab-item:hover {
  background: var(--bg-primary);
}

.tab-item.active {
  background: var(--bg-editor);
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent-primary);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.tab-dirty {
  color: var(--accent-primary);
  font-size: 10px;
  flex-shrink: 0;
}

.tab-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 3px;
}

.tab-close:hover {
  background: var(--border-primary);
  color: var(--text-primary);
}

.tab-item.drop-target {
  border-left: 2px solid var(--accent-primary);
}
</style>
