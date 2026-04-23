<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { tabs, activeTabId, switchTab, closeTab, moveTab, closeOtherTabs, closeTabsToRight } from '../../core/stores/tabStore'

const { t } = useI18n()

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

// ── 右键菜单 ─────────────────────────────────────────────────────────────────

const contextMenu = ref<{ x: number; y: number; tabId: string } | null>(null)

function handleContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault()
  contextMenu.value = { x: e.clientX, y: e.clientY, tabId }
}

function closeContextMenu() {
  contextMenu.value = null
}

function ctxClose() {
  if (contextMenu.value) closeTab(contextMenu.value.tabId)
  closeContextMenu()
}

function ctxCloseOthers() {
  if (contextMenu.value) closeOtherTabs(contextMenu.value.tabId)
  closeContextMenu()
}

function ctxCloseRight() {
  if (contextMenu.value) closeTabsToRight(contextMenu.value.tabId)
  closeContextMenu()
}

function ctxCopyPath() {
  if (!contextMenu.value) return
  const tab = tabs.value.find((t) => t.id === contextMenu.value!.tabId)
  if (tab?.filePath) {
    navigator.clipboard.writeText(tab.filePath)
  }
  closeContextMenu()
}

// 点击其他区域关闭右键菜单
function handleGlobalClick() {
  closeContextMenu()
}

// ── 溢出滚动 ─────────────────────────────────────────────────────────────────

const tabListRef = ref<HTMLElement | null>(null)

function handleWheel(e: WheelEvent) {
  if (tabListRef.value) {
    tabListRef.value.scrollLeft += e.deltaY
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<template>
  <div class="tab-bar">
    <div class="tab-list" ref="tabListRef" @wheel.prevent="handleWheel">
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
        @contextmenu="handleContextMenu($event, tab.id)"
      >
        <span class="tab-name">{{ tab.fileName }}</span>
        <span v-if="tab.dirty" class="tab-dirty">●</span>
        <button class="tab-close" @click="handleClose($event, tab.id)">&times;</button>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="tab-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="ctx-item" @click="ctxClose">{{ t('tabs.close') }}</div>
        <div class="ctx-item" @click="ctxCloseOthers">{{ t('tabs.closeOthers') }}</div>
        <div class="ctx-item" @click="ctxCloseRight">{{ t('tabs.closeToRight') }}</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" @click="ctxCopyPath">{{ t('tabs.copyPath') }}</div>
      </div>
    </Teleport>
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
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
}

.tab-list::-webkit-scrollbar {
  display: none; /* Chrome/Edge */
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
  flex-shrink: 0;
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

<style>
.tab-context-menu {
  position: fixed;
  z-index: 1000;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.ctx-item {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.ctx-item:hover {
  background: var(--accent-primary);
  color: white;
}

.ctx-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}
</style>
