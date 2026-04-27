<script setup lang="ts">
/**
 * AboutDialog — modal dialog showing app identity, version and legal info.
 *
 * Mirrors the "About" pattern used by common editors (VS Code, Typora):
 *   - Product name and logo
 *   - Version numbers (app + runtime) pulled from Tauri at mount time
 *   - License and copyright notice
 *   - Project link that opens in the OS default browser via the opener plugin
 *   - "Copy Version Info" button that writes a plain-text diagnostic bundle
 *     to the clipboard, so users can paste it into bug reports
 *
 * Closes on Escape or when the backdrop is clicked.
 */
import { ref, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion, getTauriVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const appVersion = ref<string>('')
const tauriVersion = ref<string>('')
const copied = ref(false)

const REPO_URL = 'https://github.com/bolthq/boltmd'

async function loadVersions(): Promise<void> {
  try {
    appVersion.value = await getVersion()
  } catch {
    appVersion.value = '-'
  }
  try {
    tauriVersion.value = await getTauriVersion()
  } catch {
    tauriVersion.value = '-'
  }
}

function buildVersionInfo(): string {
  // Plain-text block tailored for pasting into issue trackers.
  return [
    `BoltMD ${appVersion.value}`,
    `Tauri ${tauriVersion.value}`,
    `OS ${navigator.platform}`,
    `UA ${navigator.userAgent}`,
  ].join('\n')
}

async function copyVersionInfo(): Promise<void> {
  const text = buildVersionInfo()
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch (err) {
    console.error('[AboutDialog] Failed to copy version info', err)
  }
}

async function openRepo(): Promise<void> {
  try {
    await openUrl(REPO_URL)
  } catch (err) {
    console.error('[AboutDialog] Failed to open repo URL', err)
  }
}

function handleOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains('about-overlay')) {
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  loadVersions()
  // Focus the panel so Escape lands here immediately without requiring a click.
  nextTick(() => {
    const panel = document.querySelector<HTMLElement>('.about-panel')
    panel?.focus()
  })
})
</script>

<template>
  <div class="about-overlay" @click="handleOverlayClick" @keydown="handleKeydown">
    <div class="about-panel" tabindex="-1">
      <button class="about-close" :title="t('about.close')" @click="emit('close')">×</button>

      <img class="about-logo" src="/logo.png" alt="BoltMD" />
      <div class="about-name">BoltMD</div>
      <div class="about-tagline">{{ t('about.tagline') }}</div>

      <div class="about-versions">
        <div class="about-version-row">
          <span class="about-version-label">{{ t('about.version') }}</span>
          <span class="about-version-value">{{ appVersion || '…' }}</span>
        </div>
        <div class="about-version-row">
          <span class="about-version-label">Tauri</span>
          <span class="about-version-value">{{ tauriVersion || '…' }}</span>
        </div>
      </div>

      <div class="about-actions">
        <button class="about-btn" @click="copyVersionInfo">
          {{ copied ? t('about.copied') : t('about.copyVersionInfo') }}
        </button>
        <button class="about-btn" @click="openRepo">
          {{ t('about.github') }}
        </button>
      </div>

      <div class="about-legal">
        <div>{{ t('about.license') }}</div>
        <div>{{ t('about.copyright') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
}

.about-panel {
  position: relative;
  width: 360px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  outline: none;
}

.about-close {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 24px;
  height: 24px;
  line-height: 20px;
  font-size: 18px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
}

.about-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.about-logo {
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
  user-select: none;
  -webkit-user-drag: none;
}

.about-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.about-tagline {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.about-versions {
  margin-top: 16px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.about-version-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.about-version-label {
  color: var(--text-muted);
}

.about-version-value {
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.about-actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  width: 100%;
}

.about-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}

.about-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.about-legal {
  margin-top: 16px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.6;
}
</style>
