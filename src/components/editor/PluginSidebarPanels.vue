<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { pluginSidebarPanels, sidebarShowSignal } from '../../core/plugins'
import type { PluginSidebarPanel } from '../../core/plugins'
import { configService } from '../../core/services/ConfigService'

// Track mounted panel cleanups.
const cleanups = new Map<string, () => void>()
const containerRefs = ref<Map<string, HTMLElement>>(new Map())

// --- Active panel (null = all collapsed) ---
const activePanelId = ref<string | null>(null)

function openPanel(panelId: string) {
  activePanelId.value = panelId
  nextTick(() => {
    const el = containerRefs.value.get(panelId)
    const panel = pluginSidebarPanels.value.find(p => p.id === panelId)
    if (el && panel && !cleanups.has(panelId)) {
      mountPanel(panel, el)
    }
  })
}

function closePanel() {
  activePanelId.value = null
}

// --- Position (left / right) ---
const position = ref<'left' | 'right'>(configService.get('pluginSidebarPosition') ?? 'left')

function togglePosition() {
  position.value = position.value === 'left' ? 'right' : 'left'
  configService.set('pluginSidebarPosition', position.value)
}

// --- Resizable width ---
const MIN_WIDTH = 180
const MAX_WIDTH = 500
const panelWidth = ref<number>(configService.get('pluginSidebarWidth') ?? 260)

function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = panelWidth.value

  function onMove(ev: MouseEvent) {
    const delta = ev.clientX - startX
    const newWidth = position.value === 'left'
      ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
      : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - delta))
    panelWidth.value = newWidth
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    configService.set('pluginSidebarWidth', panelWidth.value)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Watch for programmatic show requests from plugins (e.g. via sidebar.show()).
watch(sidebarShowSignal, (signal) => {
  if (signal.tick === 0) return
  if (signal.panelId) {
    // Toggle: if requesting the already-active panel, close it.
    if (activePanelId.value === signal.panelId) {
      closePanel()
    } else {
      openPanel(signal.panelId)
    }
  } else {
    // No specific panel: if open, close; if closed, open first panel.
    if (activePanelId.value) {
      closePanel()
    } else if (pluginSidebarPanels.value.length > 0) {
      openPanel(pluginSidebarPanels.value[0].id)
    }
  }
})

// --- Panel mounting ---
function mountPanel(panel: PluginSidebarPanel, el: HTMLElement) {
  const prev = cleanups.get(panel.id)
  if (prev) {
    try { prev() } catch { /* ignore */ }
    cleanups.delete(panel.id)
  }
  el.innerHTML = ''
  try {
    const cleanup = panel.mount(el)
    if (typeof cleanup === 'function') {
      cleanups.set(panel.id, cleanup)
    }
  } catch (err) {
    console.error(`[PluginSidebar] Failed to mount panel "${panel.id}":`, err)
    el.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

function setContainerRef(id: string, el: HTMLElement | null) {
  if (el) {
    containerRefs.value.set(id, el)
    const panel = pluginSidebarPanels.value.find(p => p.id === id)
    if (panel) mountPanel(panel, el)
  } else {
    containerRefs.value.delete(id)
  }
}

// Re-mount when panels change.
watch(pluginSidebarPanels, (panels) => {
  for (const [id, cleanup] of cleanups) {
    if (!panels.find(p => p.id === id)) {
      try { cleanup() } catch { /* ignore */ }
      cleanups.delete(id)
    }
  }
  for (const panel of panels) {
    const el = containerRefs.value.get(panel.id)
    if (el && !cleanups.has(panel.id)) {
      mountPanel(panel, el)
    }
  }
  // If active panel was removed, close.
  if (activePanelId.value && !panels.find(p => p.id === activePanelId.value)) {
    activePanelId.value = null
  }
}, { deep: true })

onUnmounted(() => {
  for (const cleanup of cleanups.values()) {
    try { cleanup() } catch { /* ignore */ }
  }
  cleanups.clear()
})
</script>

<template>
  <!-- Activity bar: icon strip (always visible when panels exist) -->
  <div
    v-if="pluginSidebarPanels.length > 0"
    class="activity-bar"
    :class="`pos-${position}`"
  >
    <button
      v-for="panel in pluginSidebarPanels"
      :key="panel.id"
      class="activity-icon"
      :class="{ active: panel.id === activePanelId }"
      :title="panel.title"
      @click="panel.id === activePanelId ? closePanel() : openPanel(panel.id)"
    >
      {{ panel.icon ?? '◧' }}
    </button>
  </div>

  <!-- Panel content area -->
  <aside
    v-if="activePanelId"
    class="plugin-sidebar"
    :class="`pos-${position}`"
    :style="{ width: panelWidth + 'px' }"
  >
    <!-- Resize handle -->
    <div
      class="sidebar-resize-handle"
      :class="position"
      @mousedown="onResizeStart"
    ></div>

    <!-- Header: panel title + actions -->
    <div class="sidebar-header">
      <span class="sidebar-title">
        {{ pluginSidebarPanels.find(p => p.id === activePanelId)?.title ?? '' }}
      </span>
      <div class="sidebar-actions">
        <button class="sidebar-action-btn" @click="togglePosition" :title="position === 'left' ? 'Move to right' : 'Move to left'">
          <svg v-if="position === 'left'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="2" width="14" height="12" rx="1" />
            <line x1="5" y1="2" x2="5" y2="14" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="2" width="14" height="12" rx="1" />
            <line x1="11" y1="2" x2="11" y2="14" />
          </svg>
        </button>
        <button class="sidebar-action-btn" @click="closePanel()" title="Close">&times;</button>
      </div>
    </div>

    <!-- Panel body -->
    <div class="sidebar-body">
      <div
        v-for="panel in pluginSidebarPanels"
        :key="panel.id"
        v-show="panel.id === activePanelId"
        class="sidebar-panel-content"
        :ref="(el) => setContainerRef(panel.id, el as HTMLElement)"
      ></div>
    </div>
  </aside>
</template>

<style scoped>
/* Activity bar: vertical icon strip */
.activity-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  gap: 2px;
  background: var(--bg-secondary);
  width: 32px;
  flex-shrink: 0;
}

.activity-bar.pos-left {
  border-right: 1px solid var(--border-primary);
}

.activity-bar.pos-right {
  order: 98;
  border-left: 1px solid var(--border-primary);
}

.activity-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  border: none;
  background: none;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.activity-icon:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.activity-icon.active {
  color: var(--text-primary);
  background: var(--bg-active);
}

/* Panel */
.plugin-sidebar {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
}

.plugin-sidebar.pos-left {
  border-right: 1px solid var(--border-primary);
}

.plugin-sidebar.pos-right {
  order: 99;
  border-left: 1px solid var(--border-primary);
}

/* Resize handle */
.sidebar-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}

.sidebar-resize-handle.left {
  right: 0;
}

.sidebar-resize-handle.right {
  left: 0;
}

.sidebar-resize-handle:hover,
.sidebar-resize-handle:active {
  background: var(--accent-primary);
  opacity: 0.4;
}

/* Header */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-primary);
  user-select: none;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}

.sidebar-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.sidebar-action-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Body */
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.sidebar-panel-content {
  height: 100%;
}
</style>
