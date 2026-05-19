<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { pluginSidebarPanels } from '../../core/plugins'
import type { PluginSidebarPanel } from '../../core/plugins'

// Track mounted panel cleanups.
const cleanups = new Map<string, () => void>()
const containerRefs = ref<Map<string, HTMLElement>>(new Map())

function mountPanel(panel: PluginSidebarPanel, el: HTMLElement) {
  // Unmount previous if exists.
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
  // Unmount removed panels.
  for (const [id, cleanup] of cleanups) {
    if (!panels.find(p => p.id === id)) {
      try { cleanup() } catch { /* ignore */ }
      cleanups.delete(id)
    }
  }
  // Mount new panels that have a container.
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
  <div v-if="pluginSidebarPanels.length > 0" class="plugin-sidebar-panels">
    <div
      v-for="panel in pluginSidebarPanels"
      :key="panel.id"
      class="plugin-panel"
    >
      <div class="plugin-panel-header">
        <span v-if="panel.icon" class="plugin-panel-icon">{{ panel.icon }}</span>
        <span class="plugin-panel-title">{{ panel.title }}</span>
      </div>
      <div
        class="plugin-panel-content"
        :ref="(el) => setContainerRef(panel.id, el as HTMLElement)"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.plugin-sidebar-panels {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid var(--border-primary);
}

.plugin-panel {
  display: flex;
  flex-direction: column;
}

.plugin-panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
}

.plugin-panel-icon {
  font-size: 12px;
}

.plugin-panel-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-panel-content {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  min-height: 32px;
}
</style>
