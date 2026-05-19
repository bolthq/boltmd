<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { X, Download, RefreshCw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { pluginInstances } from '../../core/plugins'
import { configService } from '../../core/services/ConfigService'

const { t } = useI18n()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'reloadPlugins'): void
}>()

// Active tab: 'installed' or 'available'
const activeTab = ref<'installed' | 'available'>('installed')

// ── Installed plugins ─────────────────────────────────────────────────────────

const disabledPlugins = ref<string[]>(configService.get('disabledPlugins') ?? [])

const installedList = computed(() =>
  pluginInstances.value.map(p => ({
    id: p.manifest.id,
    name: p.manifest.name,
    version: p.manifest.version,
    author: p.manifest.author,
    description: p.manifest.description,
    state: p.state,
    error: p.error,
    enabled: !disabledPlugins.value.includes(p.manifest.id),
  }))
)

async function togglePlugin(pluginId: string, enabled: boolean) {
  if (enabled) {
    disabledPlugins.value = disabledPlugins.value.filter(id => id !== pluginId)
  } else {
    disabledPlugins.value = [...disabledPlugins.value, pluginId]
  }
  await configService.set('disabledPlugins', disabledPlugins.value)
}

// ── Official plugins (available for future install) ───────────────────────────

interface OfficialPlugin {
  id: string
  name: string
  description: string
  author: string
  status: 'available' | 'coming-soon'
  downloadUrl?: string
}

// Hardcoded official plugin registry. This list will eventually be fetched
// from a remote JSON source when the plugin marketplace is implemented.
// Ordered by importance/priority.
const officialPlugins: OfficialPlugin[] = [
  {
    id: 'local-history',
    name: 'Local Version History',
    description: 'Automatic version snapshots on every save with diff view and restore.',
    author: 'BoltMD',
    status: 'coming-soon',
  },
  {
    id: 'katex-math',
    name: 'KaTeX Math',
    description: 'Render LaTeX math expressions inline ($...$) and in blocks ($$...$$).',
    author: 'BoltMD',
    status: 'coming-soon',
  },
  {
    id: 'global-search',
    name: 'Global Search',
    description: 'Cross-file search and replace powered by ripgrep.',
    author: 'BoltMD',
    status: 'coming-soon',
  },
  {
    id: 'minimap',
    name: 'Minimap',
    description: 'Code minimap for quick navigation in long documents.',
    author: 'BoltMD',
    status: 'coming-soon',
  },
  {
    id: 'yaml-frontmatter',
    name: 'YAML Frontmatter',
    description: 'Collapsible YAML frontmatter rendering with syntax highlighting.',
    author: 'BoltMD',
    status: 'coming-soon',
  },
]

// Filter out plugins already installed locally.
const availablePlugins = computed(() =>
  officialPlugins.filter(op => !pluginInstances.value.some(p => p.manifest.id === op.id))
)

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('plugin-overlay')) {
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="plugin-overlay" @click="handleOverlayClick">
    <div class="plugin-panel">
      <!-- Header -->
      <div class="plugin-header">
        <h2 class="plugin-title">{{ t('plugins.title') }}</h2>
        <div class="plugin-header-actions">
          <button class="plugin-action-btn" :title="t('plugins.reload')" @click="emit('reloadPlugins')">
            <RefreshCw :size="14" />
          </button>
          <button class="plugin-close" @click="emit('close')" :title="t('settings.close')">
            <X :size="16" />
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="plugin-tabs">
        <button
          class="plugin-tab"
          :class="{ active: activeTab === 'installed' }"
          @click="activeTab = 'installed'"
        >
          {{ t('plugins.installed') }}
          <span class="plugin-tab-count">{{ installedList.length }}</span>
        </button>
        <button
          class="plugin-tab"
          :class="{ active: activeTab === 'available' }"
          @click="activeTab = 'available'"
        >
          {{ t('plugins.available') }}
          <span class="plugin-tab-count">{{ availablePlugins.length }}</span>
        </button>
      </div>

      <!-- Content -->
      <div class="plugin-body">
        <!-- Installed tab -->
        <div v-if="activeTab === 'installed'">
          <div v-if="installedList.length === 0" class="plugin-empty">
            {{ t('plugins.noInstalled') }}
          </div>
          <div v-else class="plugin-list">
            <div v-for="p in installedList" :key="p.id" class="plugin-card">
              <div class="plugin-card-info">
                <div class="plugin-card-header">
                  <span class="plugin-card-name">{{ p.name }}</span>
                  <span class="plugin-card-version">v{{ p.version }}</span>
                  <span
                    class="plugin-badge"
                    :class="{
                      'badge-active': p.state === 'active',
                      'badge-error': p.state === 'error',
                      'badge-inactive': p.state === 'inactive',
                    }"
                  >
                    {{ p.state === 'active' ? t('plugins.active') : p.state === 'error' ? t('plugins.error') : t('plugins.inactive') }}
                  </span>
                </div>
                <div class="plugin-card-desc">{{ p.description }}</div>
                <div class="plugin-card-author">{{ p.author }}</div>
                <div v-if="p.error" class="plugin-card-error">{{ p.error }}</div>
              </div>
              <div class="plugin-card-actions">
                <label class="plugin-toggle">
                  <input
                    type="checkbox"
                    :checked="p.enabled"
                    @change="togglePlugin(p.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="plugin-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Available tab -->
        <div v-if="activeTab === 'available'">
          <div v-if="availablePlugins.length === 0" class="plugin-empty">
            {{ t('plugins.allInstalled') }}
          </div>
          <div v-else class="plugin-list">
            <div v-for="p in availablePlugins" :key="p.id" class="plugin-card">
              <div class="plugin-card-info">
                <div class="plugin-card-header">
                  <span class="plugin-card-name">{{ p.name }}</span>
                  <span
                    class="plugin-badge badge-coming-soon"
                  >
                    {{ t('plugins.comingSoon') }}
                  </span>
                </div>
                <div class="plugin-card-desc">{{ p.description }}</div>
                <div class="plugin-card-author">{{ p.author }}</div>
              </div>
              <div class="plugin-card-actions">
                <button
                  v-if="p.status === 'available'"
                  class="plugin-install-btn"
                  :title="t('plugins.install')"
                >
                  <Download :size="14" />
                  {{ t('plugins.install') }}
                </button>
                <span v-else class="plugin-coming-soon-label">—</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer hint -->
      <div class="plugin-footer">
        {{ t('plugins.hint') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 50px;
  z-index: 1000;
}

.plugin-panel {
  width: 560px;
  max-height: calc(100vh - 100px);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.plugin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.plugin-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.plugin-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.plugin-action-btn,
.plugin-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.plugin-action-btn:hover,
.plugin-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.plugin-tabs {
  display: flex;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.plugin-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.plugin-tab:hover {
  color: var(--text-primary);
}

.plugin-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.plugin-tab-count {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.plugin-tab.active .plugin-tab-count {
  background: var(--accent-primary);
  color: white;
}

.plugin-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

.plugin-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-secondary);
  transition: border-color 0.15s;
}

.plugin-card:hover {
  border-color: var(--accent-primary);
}

.plugin-card-info {
  flex: 1;
  min-width: 0;
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.plugin-card-version {
  font-size: 11px;
  color: var(--text-muted);
}

.plugin-card-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.plugin-card-author {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-muted);
}

.plugin-card-error {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-error, #e53e3e);
  background: rgba(229, 62, 62, 0.08);
  padding: 4px 8px;
  border-radius: 4px;
}

.plugin-card-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

/* Badge styles */
.plugin-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.badge-active {
  background: rgba(72, 187, 120, 0.15);
  color: #38a169;
}

.badge-error {
  background: rgba(229, 62, 62, 0.15);
  color: #e53e3e;
}

.badge-inactive {
  background: rgba(160, 174, 192, 0.15);
  color: #718096;
}

.badge-coming-soon {
  background: rgba(66, 153, 225, 0.12);
  color: #3182ce;
}

/* Toggle switch */
.plugin-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}

.plugin-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.plugin-toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--bg-tertiary);
  border-radius: 10px;
  transition: background 0.2s;
}

.plugin-toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.plugin-toggle input:checked + .plugin-toggle-slider {
  background: var(--accent-primary);
}

.plugin-toggle input:checked + .plugin-toggle-slider::before {
  transform: translateX(16px);
}

/* Install button */
.plugin-install-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-primary);
  background: rgba(66, 153, 225, 0.08);
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.plugin-install-btn:hover {
  background: rgba(66, 153, 225, 0.15);
}

.plugin-coming-soon-label {
  color: var(--text-muted);
  font-size: 12px;
}

.plugin-footer {
  padding: 10px 20px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--border-primary);
  flex-shrink: 0;
}
</style>
