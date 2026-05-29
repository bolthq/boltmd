<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { pluginSidebarPanels, sidebarShowSignal } from '../../core/plugins'
import type { PluginSidebarPanel } from '../../core/plugins'
import { configService } from '../../core/services/ConfigService'

// Track mounted panel cleanups.
const cleanups = new Map<string, () => void>()
const containerRefs = ref<Map<string, HTMLElement>>(new Map())

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
    // When on left side, drag right edge → positive delta = wider.
    // When on right side, drag left edge → negative delta = wider.
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

// --- Collapse / expand ---
const collapsed = ref(false)

// Watch for programmatic show requests from plugins (e.g. via sidebar.show()).
watch(sidebarShowSignal, (signal) => {
  if (signal.tick === 0) return
  collapsed.value = !collapsed.value
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
}, { deep: true })

onUnmounted(() => {
  for (const cleanup of cleanups.values()) {
    try { cleanup() } catch { /* ignore */ }
  }
  cleanups.clear()
})
</script>

<template>
  <aside
    v-if="pluginSidebarPanels.length > 0"
    class="plugin-sidebar"
    :class="[`pos-${position}`, { collapsed }]"
    :style="{ width: collapsed ? '0px' : panelWidth + 'px' }"
  >
    <!-- Resize handle -->
    <div
      class="sidebar-resize-handle"
      :class="position"
      @mousedown="onResizeStart"
    ></div>

    <!-- Header -->
    <div v-show="!collapsed" class="sidebar-header">
      <div class="sidebar-tabs">
        <span
          v-for="panel in pluginSidebarPanels"
          :key="panel.id"
          class="sidebar-tab active"
        >
          <span v-if="panel.icon" class="sidebar-tab-icon">{{ panel.icon }}</span>
          {{ panel.title }}
        </span>
      </div>
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
        <button class="sidebar-action-btn" @click="collapsed = true" title="Collapse">&times;</button>
      </div>
    </div>

    <!-- Panel content -->
    <div v-show="!collapsed" class="sidebar-body">
      <div
        v-for="panel in pluginSidebarPanels"
        :key="panel.id"
        class="sidebar-panel-content"
        :ref="(el) => setContainerRef(panel.id, el as HTMLElement)"
      ></div>
    </div>
  </aside>

  <!-- Collapsed indicator (clickable to expand) -->
  <div
    v-if="pluginSidebarPanels.length > 0 && collapsed"
    class="sidebar-collapsed-tab"
    :class="`pos-${position}`"
    @click="collapsed = false"
    title="Expand panel"
  >
    <span class="collapsed-icon">{{ pluginSidebarPanels[0]?.icon ?? '◧' }}</span>
  </div>
</template>

<style scoped>
.plugin-sidebar {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
  transition: width 0.15s ease;
}

.plugin-sidebar.pos-left {
  border-right: 1px solid var(--border-primary);
}

.plugin-sidebar.pos-right {
  order: 99;
  border-left: 1px solid var(--border-primary);
}

.plugin-sidebar.collapsed {
  width: 0 !important;
  border: none;
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

.sidebar-tabs {
  display: flex;
  gap: 4px;
  overflow: hidden;
}

.sidebar-tab {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: none;
}

.sidebar-tab.active {
  color: var(--text-primary);
}

.sidebar-tab-icon {
  margin-right: 4px;
  font-size: 11px;
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

/* Collapsed tab */
.sidebar-collapsed-tab {
  width: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  cursor: pointer;
  background: var(--bg-secondary);
}

.sidebar-collapsed-tab.pos-left {
  border-right: 1px solid var(--border-primary);
}

.sidebar-collapsed-tab.pos-right {
  order: 99;
  border-left: 1px solid var(--border-primary);
}

.sidebar-collapsed-tab:hover {
  background: var(--bg-hover);
}

.collapsed-icon {
  font-size: 14px;
  writing-mode: vertical-rl;
  color: var(--text-secondary);
}
</style>
