import type { TabState, ITabManager } from '../types/tab'
import { saveSnapshot, restoreFromSnapshot } from './EditorManager'
import { t } from '../../i18n'

let tabIdCounter = 0
function genId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`
}

function createDefaultTab(): TabState {
  return {
    id: genId(),
    filePath: null,
    fileName: t('tabs.untitled'),
    content: '',
    dirty: false,
    editorMode: 'wysiwyg',
    cursorPosition: { line: 0, column: 0, offset: 0 },
    scrollPosition: 0,
    lastModified: Date.now(),
  }
}

/**
 * TabManager — 纯逻辑层，管理标签的增删改查
 *
 * 职责：
 * 1. tabs 列表的 CRUD
 * 2. 同一文件防重复打开（已打开则跳转）
 * 3. 切换标签时与 EditorManager 协作（saveSnapshot / restoreFromSnapshot）
 * 4. 会话持久化接口（供 tabStore 调用）
 *
 * 设计：
 * - 不持有 Vue 响应式状态（由 tabStore 包装）
 * - 通过 onChange 回调通知外部状态更新
 */
export class TabManager implements ITabManager {
  private tabs: TabState[] = []
  private activeTabId: string | null = null
  private onChangeCallback: (() => void) | null = null
  private onLastTabClosedCallback: (() => void) | null = null

  /** 注册状态变更回调（tabStore 使用） */
  onChange(callback: () => void): void {
    this.onChangeCallback = callback
  }

  /** 注册最后一个标签关闭回调（用于退出应用） */
  onLastTabClosed(callback: () => void): void {
    this.onLastTabClosedCallback = callback
  }

  private notify(): void {
    this.onChangeCallback?.()
  }

  /** 延迟通知（用于高频内容更新，减少 Vue 响应式开销） */
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private notifyLazy(): void {
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    this.notifyTimer = setTimeout(() => {
      this.onChangeCallback?.()
    }, 100)
  }

  getTabs(): TabState[] {
    return [...this.tabs]
  }

  getActiveTab(): TabState | null {
    return this.tabs.find((t) => t.id === this.activeTabId) ?? null
  }

  getActiveTabId(): string | null {
    return this.activeTabId
  }

  /** 新建空白标签 */
  createTab(): TabState {
    const tab = createDefaultTab()
    this.tabs.push(tab)
    this.switchTab(tab.id)
    return tab
  }

  /** 打开文件到新标签（防重复） */
  openTab(filePath: string, content: string): TabState {
    // 防重复：已打开的文件直接跳转
    const existing = this.tabs.find((t) => t.filePath === filePath)
    if (existing) {
      this.switchTab(existing.id)
      return existing
    }

    const name = filePath.split(/[\\/]/).pop() ?? 'untitled.md'
    const tab: TabState = {
      id: genId(),
      filePath,
      fileName: name,
      content,
      dirty: false,
      editorMode: 'wysiwyg',
      cursorPosition: { line: 0, column: 0, offset: 0 },
      scrollPosition: 0,
      lastModified: Date.now(),
    }
    this.tabs.push(tab)
    this.switchTab(tab.id)
    return tab
  }

  /**
   * Open a bundled, read-from-disk-but-not-bound-to-disk document in a new
   * tab. Used for Help content such as the Welcome page and the Markdown
   * guide: the file actually lives in the app bundle, but we treat it like
   * an untitled scratch tab so Ctrl+S naturally routes through Save As and
   * the user can't accidentally overwrite the bundled asset.
   *
   * Always creates a fresh tab — repeatedly invoking the menu entry yields
   * multiple tabs, matching "New Tab" semantics.
   */
  openBundledDocTab(title: string, content: string): TabState {
    const tab: TabState = {
      id: genId(),
      filePath: null,
      fileName: title,
      content,
      dirty: false,
      editorMode: 'wysiwyg',
      cursorPosition: { line: 0, column: 0, offset: 0 },
      scrollPosition: 0,
      lastModified: Date.now(),
    }
    this.tabs.push(tab)
    this.switchTab(tab.id)
    return tab
  }

  /** 关闭标签，返回 true 表示已关闭 */
  async closeTab(tabId: string): Promise<boolean> {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return false

    // dirty 检查由外层（tabStore/UI）处理，这里直接关闭
    const wasActive = tabId === this.activeTabId

    this.tabs.splice(index, 1)

    if (wasActive) {
      if (this.tabs.length === 0) {
        // 关闭最后一个标签：通知外部（退出应用）
        this.notify()
        this.onLastTabClosedCallback?.()
        return true
      }
      // 跳转到相邻标签
      const newIndex = Math.min(index, this.tabs.length - 1)
      this.switchTab(this.tabs[newIndex].id)
    } else {
      this.notify()
    }

    return true
  }

  /** 切换到指定标签 */
  switchTab(tabId: string): void {
    const target = this.tabs.find((t) => t.id === tabId)
    if (!target) return

    // 保存当前标签的编辑器快照
    if (this.activeTabId && this.activeTabId !== tabId) {
      const current = this.tabs.find((t) => t.id === this.activeTabId)
      if (current) {
        const snapshot = saveSnapshot()
        current.content = snapshot.content
        current.cursorPosition = snapshot.cursor
        current.scrollPosition = snapshot.scroll
        current.editorMode = snapshot.mode
      }
    }

    this.activeTabId = tabId

    // 恢复目标标签的快照到编辑器
    restoreFromSnapshot({
      content: target.content,
      cursor: target.cursorPosition,
      scroll: target.scrollPosition,
      mode: target.editorMode,
    })

    this.notify()
  }

  /** 更新标签内容（编辑器 onChange 调用） */
  updateTabContent(tabId: string, content: string): void {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return
    tab.content = content
    tab.dirty = true
    tab.lastModified = Date.now()
    this.notifyLazy()
  }

  /** 标记标签已保存 */
  markSaved(tabId: string, filePath: string): void {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (!tab) return
    tab.filePath = filePath
    tab.fileName = filePath.split(/[\\/]/).pop() ?? tab.fileName
    tab.dirty = false
    this.notify()
  }

  /** 拖拽排序 */
  moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || fromIndex >= this.tabs.length) return
    if (toIndex < 0 || toIndex >= this.tabs.length) return
    const [moved] = this.tabs.splice(fromIndex, 1)
    this.tabs.splice(toIndex, 0, moved)
    this.notify()
  }

  /** 关闭其他标签 */
  closeOtherTabs(tabId: string): void {
    this.tabs = this.tabs.filter((t) => t.id === tabId)
    if (this.activeTabId !== tabId) {
      this.switchTab(tabId)
    } else {
      this.notify()
    }
  }

  /** 关闭右侧标签 */
  closeTabsToRight(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.id === tabId)
    if (index === -1) return
    const removedIds = this.tabs.slice(index + 1).map((t) => t.id)
    this.tabs = this.tabs.slice(0, index + 1)

    // 如果活跃标签被关闭了，跳到 tabId
    if (this.activeTabId && removedIds.includes(this.activeTabId)) {
      this.switchTab(tabId)
    } else {
      this.notify()
    }
  }

  /** 保存会话（标签列表序列化） */
  saveSession(): void {
    // 先同步活跃标签的最新状态
    const active = this.getActiveTab()
    if (active) {
      const snapshot = saveSnapshot()
      active.content = snapshot.content
      active.cursorPosition = snapshot.cursor
      active.scrollPosition = snapshot.scroll
      active.editorMode = snapshot.mode
    }
    // 实际持久化由 tabStore 通过 ConfigService 完成
  }

  /** 恢复会话 */
  restoreSession(): void {
    // 由 tabStore 调用，先设置 tabs 和 activeTabId，再 switchTab
  }

  /** 批量设置标签（恢复会话用） */
  setTabs(tabs: TabState[], activeId: string | null): void {
    this.tabs = tabs
    this.activeTabId = null
    if (activeId && this.tabs.find((t) => t.id === activeId)) {
      this.switchTab(activeId)
    } else if (this.tabs.length > 0) {
      this.switchTab(this.tabs[0].id)
    } else {
      this.createTab()
    }
  }
}

/** 全局单例 */
export const tabManager = new TabManager()
