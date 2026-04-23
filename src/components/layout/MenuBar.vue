<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, getLocale, setLocale, type SupportedLocale } from '../../i18n'
import { useEditorManager } from '../../core/editor/EditorManager'
import { themeService } from '../../core/services/ThemeService'

const { t } = useI18n()
const { mode, switchMode } = useEditorManager()

const emit = defineEmits<{
  (e: 'newTab'): void
  (e: 'openFile'): void
  (e: 'save'): void
  (e: 'saveAs'): void
  (e: 'closeTab'): void
  (e: 'toggleToolbar'): void
  (e: 'openSettings'): void
  (e: 'openCommandPalette'): void
  (e: 'checkUpdate'): void
}>()

const props = defineProps<{
  showToolbar: boolean
}>()

// 当前展开的菜单（null 表示全部收起）
const openMenu = ref<string | null>(null)
const currentLocale = ref<SupportedLocale>(getLocale())

function toggleMenu(menu: string) {
  openMenu.value = openMenu.value === menu ? null : menu
}

// 鼠标悬浮直接展开菜单
function hoverMenu(menu: string) {
  openMenu.value = menu
}

function closeMenus() {
  openMenu.value = null
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
  const target = e.target as HTMLElement
  if (!target.closest('.menubar')) {
    closeMenus()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="menubar" @mouseleave="closeMenus">
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
        <div class="menu-entry" @click="doAction(() => emit('checkUpdate'))">
          <span>{{ t('menu.checkUpdate') }}</span>
        </div>
        <div class="menu-separator" />
        <div class="menu-entry disabled">
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
</style>
