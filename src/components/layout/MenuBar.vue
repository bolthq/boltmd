<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, getLocale, setLocale, type SupportedLocale } from '../../i18n'
import { useEditorManager } from '../../core/editor/EditorManager'
import { themeService } from '../../core/services/ThemeService'
import { updateService } from '../../core/services/UpdateService'
import { getRecentFiles, clearRecentFiles, removeRecentFile, checkRecentFilesExist, openFilePath } from '../../core/stores/fileStore'

const { t } = useI18n()
const { mode, switchMode } = useEditorManager()

const emit = defineEmits<{
  (e: 'newTab'): void
  (e: 'openFile'): void
  (e: 'save'): void
  (e: 'saveAs'): void
  (e: 'exportHtml'): void
  (e: 'exportPdf'): void
  (e: 'closeTab'): void
  (e: 'toggleToolbar'): void
  (e: 'toggleOutline'): void
  (e: 'zenMode'): void
  (e: 'openSettings'): void
  (e: 'openCommandPalette'): void
  (e: 'checkUpdate'): void
  (e: 'openWelcome'): void
  (e: 'openMarkdownGuide'): void
  (e: 'find'): void
  (e: 'replace'): void
  (e: 'openAbout'): void
}>()

const props = defineProps<{
  showToolbar: boolean
  showOutline: boolean
}>()

// 当前展开的菜单（null 表示全部收起）
const openMenu = ref<string | null>(null)
const currentLocale = ref<SupportedLocale>(getLocale())
let suppressClickOutside = false

function toggleMenu(menu: string) {
  openMenu.value = openMenu.value === menu ? null : menu
  if (openMenu.value === 'file') {
    checkRecentFilesExist().then((map) => {
      recentFileExists.value = map
    })
  }
}

// Hover switches menu only when another menu is already open (standard behavior).
function hoverMenu(menu: string) {
  if (openMenu.value !== null) {
    openMenu.value = menu
    if (menu === 'file') {
      checkRecentFilesExist().then((map) => {
        recentFileExists.value = map
      })
    }
  }
}

function closeMenus() {
  openMenu.value = null
}

// Reactive recent files list.
const recentFiles = computed(() => getRecentFiles())

// Track which recent file paths exist on disk.
const recentFileExists = ref<Map<string, boolean>>(new Map())

function openRecentFile(path: string) {
  // Don't open if file doesn't exist.
  if (recentFileExists.value.has(path) && !recentFileExists.value.get(path)) return
  openFilePath(path)
  closeMenus()
}

function handleClearRecent() {
  clearRecentFiles()
  closeMenus()
}

function handleRemoveRecent(path: string, e: MouseEvent) {
  e.stopPropagation()
  e.preventDefault()
  removeRecentFile(path)
  // Keep the menu open — the reactive list will re-render without the item.
  // Temporarily suppress the document click-outside handler that might fire
  // because the DOM node is removed from under the cursor.
  suppressClickOutside = true
  setTimeout(() => { suppressClickOutside = false }, 0)
}

function doAction(action: () => void) {
  action()
  closeMenus()
}

async function switchLanguage(locale: SupportedLocale) {
  await setLocale(locale)
  currentLocale.value = locale
  closeMenus()
}

// 编辑操作：通过 document.execCommand 桥接
function execEdit(cmd: string) {
  document.execCommand(cmd)
  closeMenus()
}

// 点击外部关闭菜单
function handleClickOutside(e: MouseEvent) {
  if (suppressClickOutside) return
  const target = e.target as HTMLElement
  if (!target.closest('.menubar')) {
    closeMenus()
  }
}

// Escape 关闭菜单
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openMenu.value !== null) {
    closeMenus()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="menubar">
    <!-- File 菜单 -->
    <div class="menu-item" @click.stop="toggleMenu('file')" @mouseenter="hoverMenu('file')">
      <span class="menu-label">{{ t('menu.file') }}</span>
      <div v-if="openMenu === 'file'" class="menu-dropdown">
        <div class="menu-entry" @click="doAction(() => emit('newTab'))">
          <span>{{ t('menu.newTab') }}</span>
          <span class="menu-shortcut">Ctrl+N</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('openFile'))">
          <span>{{ t('menu.openFile') }}</span>
          <span class="menu-shortcut">Ctrl+O</span>
        </div>
        <!-- Recent Files submenu -->
        <div class="menu-entry menu-submenu-parent">
          <span>{{ t('menu.recentFiles') }}</span>
          <span class="menu-arrow">▸</span>
          <div class="menu-submenu menu-submenu-recent">
            <template v-if="recentFiles.length > 0">
              <div
                v-for="item in recentFiles"
                :key="item.path"
                class="menu-entry recent-entry"
                :class="{ 'recent-missing': recentFileExists.has(item.path) && !recentFileExists.get(item.path) }"
                :title="item.path"
                @click="openRecentFile(item.path)"
              >
                <span class="recent-file-name">{{ item.path.split(/[\\/]/).pop() }}</span>
                <span class="recent-file-path">{{ item.path }}</span>
                <span class="recent-remove" title="" @click="handleRemoveRecent(item.path, $event)">&times;</span>
              </div>
              <div class="menu-separator" />
              <div class="menu-entry" @click="handleClearRecent">
                <span>{{ t('menu.clearRecent') }}</span>
              </div>
            </template>
            <div v-else class="menu-entry disabled">
              <span>{{ t('menu.noRecent') }}</span>
            </div>
          </div>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('save'))">
          <span>{{ t('menu.save') }}</span>
          <span class="menu-shortcut">Ctrl+S</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('saveAs'))">
          <span>{{ t('menu.saveAs') }}</span>
          <span class="menu-shortcut">Ctrl+Shift+S</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('exportHtml'))">
          <span>{{ t('menu.exportHtml') }}</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('exportPdf'))">
          <span>{{ t('menu.exportPdf') }}</span>
          <span class="menu-shortcut">Ctrl+P</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('closeTab'))">
          <span>{{ t('menu.closeTab') }}</span>
          <span class="menu-shortcut">Ctrl+W</span>
        </div>
      </div>
    </div>

    <!-- Edit 菜单 -->
    <div class="menu-item" @click.stop="toggleMenu('edit')" @mouseenter="hoverMenu('edit')">
      <span class="menu-label">{{ t('menu.edit') }}</span>
      <div v-if="openMenu === 'edit'" class="menu-dropdown">
        <div class="menu-entry" @click="execEdit('undo')">
          <span>{{ t('menu.undo') }}</span>
          <span class="menu-shortcut">Ctrl+Z</span>
        </div>
        <div class="menu-entry" @click="execEdit('redo')">
          <span>{{ t('menu.redo') }}</span>
          <span class="menu-shortcut">Ctrl+Y</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="execEdit('cut')">
          <span>{{ t('menu.cut') }}</span>
          <span class="menu-shortcut">Ctrl+X</span>
        </div>
        <div class="menu-entry" @click="execEdit('copy')">
          <span>{{ t('menu.copy') }}</span>
          <span class="menu-shortcut">Ctrl+C</span>
        </div>
        <div class="menu-entry" @click="execEdit('paste')">
          <span>{{ t('menu.paste') }}</span>
          <span class="menu-shortcut">Ctrl+V</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="execEdit('selectAll')">
          <span>{{ t('menu.selectAll') }}</span>
          <span class="menu-shortcut">Ctrl+A</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('find'))">
          <span>{{ t('menu.find') }}</span>
          <span class="menu-shortcut">Ctrl+F</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('replace'))">
          <span>{{ t('menu.replace') }}</span>
          <span class="menu-shortcut">Ctrl+H</span>
        </div>
      </div>
    </div>

    <!-- View 菜单 -->
    <div class="menu-item" @click.stop="toggleMenu('view')" @mouseenter="hoverMenu('view')">
      <span class="menu-label">{{ t('menu.view') }}</span>
      <div v-if="openMenu === 'view'" class="menu-dropdown">
        <div class="menu-entry" @click="doAction(() => emit('toggleToolbar'))">
          <span>
            <span class="menu-check">{{ props.showToolbar ? '✓' : '' }}</span>
            {{ t('menu.toggleToolbar') }}
          </span>
          <span class="menu-shortcut">Ctrl+Shift+T</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('toggleOutline'))">
          <span>
            <span class="menu-check">{{ props.showOutline ? '✓' : '' }}</span>
            {{ t('menu.toggleOutline') }}
          </span>
          <span class="menu-shortcut">Ctrl+Shift+L</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('zenMode'))">
          <span>{{ t('menu.zenMode') }}</span>
          <span class="menu-shortcut">F11</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => switchMode('wysiwyg'))">
          <span>
            <span class="menu-check">{{ mode === 'wysiwyg' ? '●' : '' }}</span>
            {{ t('menu.modeWysiwyg') }}
          </span>
        </div>
        <div class="menu-entry" @click="doAction(() => switchMode('source'))">
          <span>
            <span class="menu-check">{{ mode === 'source' ? '●' : '' }}</span>
            {{ t('menu.modeSource') }}
          </span>
        </div>
        <div class="menu-entry" @click="doAction(() => switchMode('split'))">
          <span>
            <span class="menu-check">{{ mode === 'split' ? '●' : '' }}</span>
            {{ t('menu.modeSplit') }}
          </span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => themeService.setTheme('light'))">
          <span>{{ t('menu.themeLight') }}</span>
        </div>
        <div class="menu-entry" @click="doAction(() => themeService.setTheme('dark'))">
          <span>{{ t('menu.themeDark') }}</span>
        </div>
        <div class="menu-entry" @click="doAction(() => themeService.setTheme('system'))">
          <span>{{ t('menu.themeSystem') }}</span>
        </div>
        <div class="menu-separator" />
        <!-- 语言子菜单 -->
        <div class="menu-entry menu-submenu-parent">
          <span>{{ t('menu.language') }}</span>
          <span class="menu-arrow">▸</span>
          <div class="menu-submenu">
            <div
              v-for="loc in SUPPORTED_LOCALES"
              :key="loc.value"
              class="menu-entry"
              @click="switchLanguage(loc.value)"
            >
              <span>
                <span class="menu-check">{{ currentLocale === loc.value ? '●' : '' }}</span>
                {{ loc.label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Help 菜单 -->
    <div class="menu-item" @click.stop="toggleMenu('help')" @mouseenter="hoverMenu('help')">
      <span class="menu-label">{{ t('menu.help') }}</span>
      <div v-if="openMenu === 'help'" class="menu-dropdown">
        <div class="menu-entry" @click="doAction(() => emit('openCommandPalette'))">
          <span>{{ t('menu.commandPalette') }}</span>
          <span class="menu-shortcut">Ctrl+Shift+P</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('openSettings'))">
          <span>{{ t('menu.settings') }}</span>
          <span class="menu-shortcut">Ctrl+,</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('openWelcome'))">
          <span>{{ t('menu.welcome') }}</span>
        </div>
        <div class="menu-entry" @click="doAction(() => emit('openMarkdownGuide'))">
          <span>{{ t('menu.markdownGuide') }}</span>
        </div>
        <div class="menu-separator" />
        <div
          class="menu-entry"
          :class="{ disabled: updateService.checking.value }"
          @click="!updateService.checking.value && doAction(() => emit('checkUpdate'))"
        >
          <span>{{ updateService.checking.value ? t('menu.checkingUpdate') : t('menu.checkUpdate') }}</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry" @click="doAction(() => emit('openAbout'))">
          <span>{{ t('menu.about') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: center;
  height: 28px;
  background: var(--titlebar-bg);
  color: var(--titlebar-text);
  border-bottom: 1px solid var(--border-primary);
  font-size: 12px;
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: no-drag;
  padding-left: 8px;
}

.menu-item {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.menu-label {
  padding: 0 8px;
  height: 100%;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 3px;
  transition: color 0.15s, text-decoration-color 0.15s;
}

.menu-label:hover,
.menu-item:has(.menu-dropdown) > .menu-label {
  color: var(--accent-primary);
  text-decoration-color: var(--accent-primary);
}

.menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 220px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  z-index: 1000;
}

.menu-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 12px;
}

.menu-entry:hover {
  background: var(--accent-primary);
  color: white;
}

.menu-entry.disabled {
  opacity: 0.5;
  cursor: default;
}

.menu-entry.disabled:hover {
  background: transparent;
  color: var(--text-primary);
}

.menu-shortcut {
  margin-left: 32px;
  font-size: 11px;
  opacity: 0.6;
}

.menu-entry:hover .menu-shortcut {
  opacity: 0.8;
}

.menu-separator {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 8px;
}

.menu-check {
  display: inline-block;
  width: 16px;
  text-align: center;
  font-size: 10px;
}

.menu-arrow {
  font-size: 10px;
  opacity: 0.6;
}

/* 子菜单 */
.menu-submenu-parent {
  position: relative;
}

.menu-submenu {
  display: none;
  position: absolute;
  left: 100%;
  top: -4px;
  min-width: 140px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  z-index: 1001;
}

.menu-submenu-parent:hover > .menu-submenu {
  display: block;
}

/* Recent files submenu */
.menu-submenu-recent {
  min-width: 280px;
  max-height: 400px;
  overflow-y: auto;
}

.recent-file-name {
  flex-shrink: 0;
}

.recent-file-path {
  margin-left: 12px;
  font-size: 10px;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.menu-entry:hover .recent-file-path {
  opacity: 0.7;
}

/* Recent file entry with remove button */
.recent-entry {
  position: relative;
  padding-right: 28px;
}

.recent-remove {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  border-radius: 3px;
  opacity: 0.6;
}

.recent-entry:hover .recent-remove {
  display: flex;
}

.recent-remove:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

/* Gray out missing files */
.recent-missing {
  opacity: 0.45;
  cursor: default;
}

.recent-missing:hover {
  background: transparent;
  color: var(--text-primary);
  opacity: 0.45;
}
</style>
