import { ref, readonly, computed } from 'vue'
import type { TabState } from '../types/tab'
import type { TabSession, TabSessionItem } from '../types/config'
import { tabManager } from '../editor/TabManager'
import { configService } from '../services/ConfigService'
import { fileService } from '../services/FileService'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import { t } from '../../i18n'

// ── 响应式状态 ───────────────────────────────────────────────────────────────

const _tabs = ref<TabState[]>([])
const _activeTabId = ref<string | null>(null)

// ── 同步：TabManager → Vue ref ─────────────────────────────────────────────

function sync(): void {
  _tabs.value = tabManager.getTabs()
  _activeTabId.value = tabManager.getActiveTabId()
}

// 注册回调，TabManager 每次变更都同步到 ref
tabManager.onChange(sync)

// 最后一个标签关闭时，关闭窗口（触发 onCloseRequested 流程）
tabManager.onLastTabClosed(() => {
  getCurrentWindow().close()
})

// ── 只读导出 ─────────────────────────────────────────────────────────────────

export const tabs = readonly(_tabs)
export const activeTabId = readonly(_activeTabId)
export const activeTab = computed<TabState | null>(() =>
  _tabs.value.find((t) => t.id === _activeTabId.value) ?? null,
)

// ── 动作（委托给 TabManager） ───────────────────────────────────────────────

export function createTab(): TabState {
  return tabManager.createTab()
}

export function openTab(filePath: string, content: string): TabState {
  return tabManager.openTab(filePath, content)
}

export function openBundledDocTab(title: string, content: string): TabState {
  return tabManager.openBundledDocTab(title, content)
}

export async function closeTab(tabId: string): Promise<boolean> {
  // Check if tab has unsaved changes before closing
  const tab = _tabs.value.find((tab) => tab.id === tabId)
  if (tab && tab.dirty) {
    const confirmed = await ask(
      t('app.unsavedMessage', { name: tab.fileName }),
      {
        title: t('app.unsavedTitle'),
        kind: 'warning',
        okLabel: t('app.discard'),
        cancelLabel: t('app.cancel'),
      },
    )
    if (!confirmed) return false
  }
  return tabManager.closeTab(tabId)
}

export function switchTab(tabId: string): void {
  tabManager.switchTab(tabId)
}

export function updateTabContent(tabId: string, content: string): void {
  tabManager.updateTabContent(tabId, content)
}

export function markSaved(tabId: string, filePath: string): void {
  tabManager.markSaved(tabId, filePath)
}

export function moveTab(fromIndex: number, toIndex: number): void {
  tabManager.moveTab(fromIndex, toIndex)
}

export function closeOtherTabs(tabId: string): void {
  tabManager.closeOtherTabs(tabId)
}

export function closeTabsToRight(tabId: string): void {
  tabManager.closeTabsToRight(tabId)
}

// ── 会话持久化 ──────────────────────────────────────────────────────────────

/** 保存当前标签会话到配置 */
export async function saveSession(): Promise<void> {
  tabManager.saveSession()
  const currentTabs = tabManager.getTabs()
  const currentActiveId = tabManager.getActiveTabId()
  const activeIndex = currentTabs.findIndex((t) => t.id === currentActiveId)

  const session: TabSession = {
    tabs: currentTabs.map((t): TabSessionItem => ({
      filePath: t.filePath,
      editorMode: t.editorMode,
    })),
    activeIndex: activeIndex >= 0 ? activeIndex : 0,
  }

  await configService.set('tabSession', session)
}

/** 从配置恢复标签会话（内容从文件重新读取） */
export async function restoreSession(): Promise<boolean> {
  const session = configService.get('tabSession')
  if (!session || session.tabs.length === 0) return false

  const restoredTabs: TabState[] = []

  // Read all tab files in parallel to minimise startup latency.
  const results = await Promise.allSettled(
    session.tabs.map((item) =>
      item.filePath
        ? fileService.openFilePath(item.filePath).then((info) => ({ info, item }))
        : Promise.reject('no path'),
    ),
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { info, item } = result.value
      restoredTabs.push({
        id: '',  // setTabs will regenerate IDs via TabManager
        filePath: info.path,
        fileName: info.name,
        content: info.content,
        cleanContent: info.content,
        dirty: false,
        editorMode: item.editorMode,
        cursorPosition: { line: 0, column: 0, offset: 0 },
        scrollPosition: 0,
        lastModified: Date.now(),
      })
    }
    // Failed reads (file deleted, permission error, etc.) are silently skipped.
  }

  if (restoredTabs.length === 0) {
    // All previously-open files are gone (e.g. after a reinstall).
    // Clear the stale session and reset firstLaunch so the caller
    // can show the welcome docs again.
    await configService.set('tabSession', null)
    await configService.set('firstLaunch', true)
    return false
  }

  const activeIdx = Math.min(session.activeIndex, restoredTabs.length - 1)
  tabManager.setTabs(restoredTabs, activeIdx)
  return true
}

// ── 初始化：创建第一个空白标签 ──────────────────────────────────────────────

export function initTabs(): void {
  if (_tabs.value.length === 0) {
    tabManager.createTab()
  }
}
