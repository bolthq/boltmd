<script setup lang="ts">
import { ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { activeTab } from '../../core/stores/tabStore'

const isMaximized = ref(false)

// 初始化最大化状态
getCurrentWindow().isMaximized().then((v) => { isMaximized.value = v })

async function handleMinimize() {
  await getCurrentWindow().minimize()
}

async function handleToggleMaximize() {
  await getCurrentWindow().toggleMaximize()
  isMaximized.value = await getCurrentWindow().isMaximized()
}

async function handleClose() {
  await getCurrentWindow().close()
}

function handleDoubleClick() {
  handleToggleMaximize()
}

async function handleDrag(e: MouseEvent) {
  // 避免按钮区域触发拖拽
  if ((e.target as HTMLElement).closest('.titlebar-controls')) return
  await getCurrentWindow().startDragging()
}
</script>

<template>
  <div class="titlebar" @mousedown="handleDrag" @dblclick="handleDoubleClick">
    <!-- 左侧：应用名 -->
    <div class="titlebar-brand">BoltMD</div>

    <!-- 中间：文件名 -->
    <div class="titlebar-title">
      <template v-if="activeTab">
        <span>{{ activeTab.fileName }}</span>
        <span v-if="activeTab.dirty" class="titlebar-dirty">●</span>
      </template>
    </div>

    <!-- 右侧：窗口控制按钮 -->
    <div class="titlebar-controls">
      <button class="titlebar-btn" @click="handleMinimize" title="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button class="titlebar-btn" @click="handleToggleMaximize" :title="isMaximized ? 'Restore' : 'Maximize'">
        <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="0.5" y="2.5" width="7" height="7" fill="var(--titlebar-bg)" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" @click="handleClose" title="Close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" stroke-width="1.2"/>
          <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--titlebar-bg);
  color: var(--titlebar-text);
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: drag;
}

.titlebar-brand {
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-primary);
  flex-shrink: 0;
}

.titlebar-title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-dirty {
  color: var(--accent-primary);
  margin-left: 4px;
  font-size: 10px;
}

.titlebar-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  background: none;
  border: none;
  color: var(--titlebar-text);
  cursor: pointer;
}

.titlebar-btn:hover {
  background: var(--bg-hover);
}

.titlebar-btn-close:hover {
  background: #e81123;
  color: white;
}
</style>
