import { ref, readonly, type Ref, type DeepReadonly } from 'vue'
import type { Editor } from '@tiptap/core'
import type { EditorMode, EditorSnapshot, IEditor, CursorPosition, SearchOptions, SearchState } from './types'

// 模式循环顺序
const MODE_CYCLE: EditorMode[] = ['wysiwyg', 'source', 'split']

/**
 * EditorManager — 管理编辑模式切换和编辑器快照
 *
 * 职责：
 * 1. 维护当前编辑模式（wysiwyg / source / split）
 * 2. 模式切换时保存/恢复内容和光标
 * 3. 提供 saveSnapshot / restoreFromSnapshot 供 TabManager 调用
 *
 * 设计：
 * - 使用 Vue ref 响应式状态，组件 watch mode 变化自动切换渲染
 * - 不直接创建/销毁编辑器实例，由 EditorContainer.vue 根据 mode 渲染组件
 * - 通过 registerEditor / unregisterEditor 跟踪当前活跃编辑器
 */

// 当前活跃的编辑器实例引用（由组件注册）
let activeEditor: IEditor | null = null

// Tiptap 原始 Editor 引用（仅 WYSIWYG 模式，供 Toolbar 使用）
let tiptapEditor: Editor | null = null

// 切换前保存的光标和滚动位置（用于恢复）
let pendingCursor: CursorPosition | null = null
let pendingScroll: number = 0

// 响应式状态
const mode = ref<EditorMode>('wysiwyg')
const content = ref('')

/**
 * 注册当前活跃的编辑器实例
 * 由 EditorContainer 中的子组件 mounted 时调用
 */
export function registerEditor(editor: IEditor): void {
  activeEditor = editor

  // 如果有待恢复的光标位置，恢复它
  if (pendingCursor) {
    try {
      editor.setCursorPosition(pendingCursor)
    } catch {
      // 光标位置可能在新编辑器中无效，忽略
    }
    pendingCursor = null
  }

  // 恢复滚动位置
  if (pendingScroll > 0) {
    // 延迟一帧让编辑器完成布局后再设置滚动
    requestAnimationFrame(() => {
      try {
        editor.setScrollPosition(pendingScroll)
      } catch {
        // 忽略
      }
      pendingScroll = 0
    })
  }

  // 聚焦编辑器
  requestAnimationFrame(() => {
    editor.focus()
  })
}

/**
 * 注销编辑器实例
 * 由子组件 unmounted 时调用
 */
export function unregisterEditor(editor: IEditor): void {
  if (activeEditor === editor) {
    activeEditor = null
  }
}

/**
 * 切换编辑模式
 * 1. 从当前编辑器获取内容和光标
 * 2. 更新 content ref（供新编辑器初始化用）
 * 3. 更新 mode ref（触发组件切换）
 */
export function switchMode(newMode: EditorMode): void {
  if (newMode === mode.value) return

  // 从当前编辑器抓取最新状态
  if (activeEditor) {
    content.value = activeEditor.getContent()
    pendingCursor = activeEditor.getCursorPosition()
    pendingScroll = activeEditor.getScrollPosition()
  }

  // 更新模式 → 触发 EditorContainer 重新渲染
  mode.value = newMode
}

/**
 * 循环切换模式（Ctrl+/ 用）
 * wysiwyg → source → split → wysiwyg
 */
export function cycleMode(): void {
  const currentIndex = MODE_CYCLE.indexOf(mode.value)
  const nextIndex = (currentIndex + 1) % MODE_CYCLE.length
  switchMode(MODE_CYCLE[nextIndex])
}

/**
 * 获取当前编辑器的完整快照
 * 供 TabManager 在切换标签前调用
 */
export function saveSnapshot(): EditorSnapshot {
  if (activeEditor) {
    return {
      content: activeEditor.getContent(),
      cursor: activeEditor.getCursorPosition(),
      scroll: activeEditor.getScrollPosition(),
      mode: mode.value,
    }
  }

  // 没有活跃编辑器时，返回当前已知状态
  return {
    content: content.value,
    cursor: { line: 0, column: 0, offset: 0 },
    scroll: 0,
    mode: mode.value,
  }
}

/**
 * 从快照恢复
 * 供 TabManager 在切换到新标签后调用
 */
export function restoreFromSnapshot(snapshot: EditorSnapshot): void {
  content.value = snapshot.content
  pendingCursor = snapshot.cursor
  pendingScroll = snapshot.scroll
  mode.value = snapshot.mode
}

/**
 * 设置内容（外部调用，如打开文件时）
 */
export function setContent(markdown: string): void {
  content.value = markdown
  if (activeEditor) {
    activeEditor.setContent(markdown)
  }
}

/**
 * 获取当前内容
 */
export function getContent(): string {
  if (activeEditor) {
    return activeEditor.getContent()
  }
  return content.value
}

/**
 * 获取当前活跃编辑器（可能为 null）
 */
export function getActiveEditor(): IEditor | null {
  return activeEditor
}

// ---- 查找 / 替换（透传给当前激活的编辑器） ----

const EMPTY_STATE: SearchState = { total: 0, current: 0 }

export function searchInEditor(query: string, options: SearchOptions): SearchState {
  if (!activeEditor) return EMPTY_STATE
  return activeEditor.search(query, options)
}

export function gotoNextMatch(): SearchState {
  if (!activeEditor) return EMPTY_STATE
  return activeEditor.gotoNextMatch()
}

export function gotoPrevMatch(): SearchState {
  if (!activeEditor) return EMPTY_STATE
  return activeEditor.gotoPrevMatch()
}

export function replaceNextInEditor(replacement: string): SearchState {
  if (!activeEditor) return EMPTY_STATE
  return activeEditor.replaceNext(replacement)
}

export function replaceAllInEditor(replacement: string): number {
  if (!activeEditor) return 0
  return activeEditor.replaceAll(replacement)
}

export function clearSearch(): void {
  activeEditor?.clearSearch()
}

/**
 * Return the currently selected text from the active editor.
 * Empty string when there's no active editor or no selection.
 */
export function getSelectionInEditor(): string {
  if (!activeEditor) return ''
  return activeEditor.getSelection()
}

/**
 * 注册 Tiptap 原始 Editor 实例（仅 WYSIWYG 模式）
 * 供 Toolbar 调用格式化命令
 */
export function registerTiptapEditor(editor: Editor): void {
  tiptapEditor = editor
}

/**
 * 注销 Tiptap Editor 实例
 */
export function unregisterTiptapEditor(): void {
  tiptapEditor = null
}

/**
 * 获取 Tiptap 原始 Editor 实例（可能为 null）
 */
export function getTiptapEditor(): Editor | null {
  return tiptapEditor
}

/**
 * 组合式函数 — 在组件中使用
 * 返回响应式的 mode 和 content
 */
export function useEditorManager() {
  return {
    mode: readonly(mode) as DeepReadonly<Ref<EditorMode>>,
    content: readonly(content) as DeepReadonly<Ref<string>>,
    switchMode,
    cycleMode,
    saveSnapshot,
    restoreFromSnapshot,
    setContent,
    getContent,
    getActiveEditor,
    registerEditor,
    unregisterEditor,
    registerTiptapEditor,
    unregisterTiptapEditor,
    getTiptapEditor,
    // 查找 / 替换
    searchInEditor,
    gotoNextMatch,
    gotoPrevMatch,
    replaceNextInEditor,
    replaceAllInEditor,
    clearSearch,
    getSelectionInEditor,
  }
}
