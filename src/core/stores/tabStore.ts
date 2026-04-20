import { ref, readonly, computed } from 'vue'
import type { TabState } from '../types/tab'
import { tabManager } from '../editor/TabManager'

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

export async function closeTab(tabId: string): Promise<boolean> {
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

// ── 初始化：创建第一个空白标签 ──────────────────────────────────────────────

export function initTabs(): void {
  if (_tabs.value.length === 0) {
    tabManager.createTab()
  }
}
