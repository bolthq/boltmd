import { ref, readonly, type Ref, type DeepReadonly } from 'vue'
import type { Editor } from '@tiptap/core'
import type { EditorMode, EditorSnapshot, IEditor, CursorPosition, SearchOptions, SearchState, DocTransfer } from './types'
import { eventBus } from '../events/EventBus'
import { AppEvent } from '../events/events'

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

// Per-mode cursor & scroll history.  Each mode independently remembers its
// own position so switching back restores where you left off.
// Cross-mode transfer uses line number (the one shared coordinate system).
interface ModePosition {
  cursor: CursorPosition
  scroll: number
}

// Pending position to restore when a new editor registers after mode switch.
let pendingPosition: ModePosition | null = null

// Pending document transfer for mode switching (direct doc sharing, no serialize/parse).
let pendingDocTransfer: DocTransfer | null = null

// 响应式状态
const mode = ref<EditorMode>('wysiwyg')
const content = ref('')

// Typewriter mode: keep cursor line vertically centered.
export const typewriterMode = ref(false)

// Current cursor line (1-based). Updated by editors on selection change.
const cursorLine = ref(1)

// Index of the heading that the cursor is currently within (-1 = none).
// Updated by editors on selection change.
const activeHeadingIndex = ref(-1)

/**
 * 注册当前活跃的编辑器实例
 * 由 EditorContainer 中的子组件 mounted 时调用
 */
export function registerEditor(editor: IEditor): void {
  activeEditor = editor

  // Direct document transfer from previous mode (highest priority).
  if (pendingDocTransfer) {
    const transfer = pendingDocTransfer
    pendingDocTransfer = null
    pendingPosition = null // Not needed when doc transfer is used
    try {
      editor.setDocTransfer(transfer)
    } catch {
      // Fallback: if doc transfer fails (schema mismatch, etc.), ignore.
    }
    // Flash cursor line so user can locate where they are in the new mode.
    // Use setTimeout(0) + rAF to ensure DOM has fully rendered and laid out
    // after doc transfer (covers async component loading + v-show transitions).
    setTimeout(() => {
      requestAnimationFrame(() => {
        editor.flashCursorLine?.()
      })
    }, 50)
    // Focus the editor.
    requestAnimationFrame(() => {
      editor.focus()
    })
    return
  }

  // Restore this mode's last known position (if any).
  if (pendingPosition) {
    try {
      editor.setCursorPosition(pendingPosition.cursor)
    } catch {
      // Position may be invalid after content changes — ignore.
    }
    const scrollTarget = pendingPosition.scroll
    if (scrollTarget > 0) {
      requestAnimationFrame(() => {
        try {
          editor.setScrollPosition(scrollTarget)
        } catch { /* ignore */ }
      })
    }
    pendingPosition = null

    // Flash the cursor line/block after position restoration so the user
    // can quickly locate where the cursor landed in the new mode.
    requestAnimationFrame(() => {
      editor.flashCursorLine?.()
    })
  }

  // Focus the editor.
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
 * 1. 从当前编辑器获取内容和光标行号
 * 2. 更新 content ref（供新编辑器初始化用）
 * 3. 将光标行号传给新模式（跨模式唯一共通坐标）
 * 4. 更新 mode ref（触发组件切换）
 */
export function switchMode(newMode: EditorMode): void {
  if (newMode === mode.value) return

  const oldMode = mode.value

  // Determine which editor "group" is active in old vs new mode:
  // - WYSIWYG group: mode === 'wysiwyg' (EditorCore is the active IEditor)
  // - Source group: mode === 'source' || mode === 'split' (SourceView is the active IEditor)
  const oldIsSource = oldMode === 'source' || oldMode === 'split'
  const newIsSource = newMode === 'source' || newMode === 'split'

  if (oldIsSource && newIsSource) {
    // Switching between source and split: same SourceView stays active.
    // No docTransfer needed. Just update mode and flash cursor.
    mode.value = newMode
    eventBus.emit(AppEvent.EditorModeChange, { mode: newMode })
    // Flash cursor after layout change. Use setTimeout + rAF to ensure
    // DOM has fully re-laid out (e.g., split pane width change).
    if (activeEditor) {
      const editorRef = activeEditor
      setTimeout(() => {
        requestAnimationFrame(() => {
          editorRef.focus()
          editorRef.flashCursorLine?.()
        })
      }, 50)
    }
    return
  }

  // Switching between different editor groups (wysiwyg ↔ source/split).
  if (activeEditor) {
    // Direct document transfer: pass PM doc + selection offset directly.
    pendingDocTransfer = activeEditor.getDocTransfer()

    // Also sync content.value for observers (OutlinePanel, etc.)
    const freshContent = activeEditor.getContent()
    if (freshContent !== content.value) {
      content.value = freshContent
    }
  }

  // Update mode → triggers EditorContainer re-render.
  mode.value = newMode
  eventBus.emit(AppEvent.EditorModeChange, { mode: newMode })
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
  pendingPosition = { cursor: snapshot.cursor, scroll: snapshot.scroll }
  // Clear any stale docTransfer from a previous mode switch that was
  // interrupted by this tab switch. Without this, registerEditor would
  // overwrite the correct tab content with the old transfer data.
  pendingDocTransfer = null
  mode.value = snapshot.mode

  // If the editor is already mounted (same mode, component not re-created),
  // registerEditor won't fire again.  Push content + scroll directly.
  if (activeEditor) {
    activeEditor.setContent(snapshot.content)
    // Clear undo history because we're switching to a different tab's document.
    activeEditor.resetForTabSwitch?.()
    // Clear pending so registerEditor (if it fires later) won't double-apply.
    const pos = pendingPosition
    pendingPosition = null
    try { activeEditor.setCursorPosition(pos.cursor) } catch { /* ignore */ }
    // Delay scroll restoration by one frame so the DOM has reflowed after
    // content replacement.
    requestAnimationFrame(() => {
      try {
        activeEditor?.setScrollPosition(pos.scroll)
      } catch { /* ignore */ }
    })
  }
}

/**
 * 设置内容（外部调用，如打开文件时）
 */
export function setContent(markdown: string): void {
  // Skip if content is already identical (avoids unnecessary DOM rebuild).
  if (markdown === content.value) return
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

/**
 * Report the current cursor line (1-based) from the active editor.
 * Called by editor components when selection changes.
 */
export function reportCursorLine(line: number): void {
  cursorLine.value = line
}

/**
 * Report the index of the heading the cursor is currently within.
 * Called by editor components when selection changes.
 */
export function reportActiveHeadingIndex(index: number): void {
  activeHeadingIndex.value = index
}

/**
 * Sync content ref from editor without pushing back to the editor.
 * Called by EditorContainer on every content change event so that
 * observers (e.g. OutlinePanel) can react to edits in real-time.
 */
export function syncContent(markdown: string): void {
  content.value = markdown
  // Notify plugin subscribers.
  for (const cb of contentChangeListeners) {
    try {
      cb(markdown)
    } catch (err) {
      console.error('[EditorManager] Error in content change listener:', err)
    }
  }
  // Emit app event for eventBus bridge.
  eventBus.emit(AppEvent.EditorContentChange)
}

// ---------------------------------------------------------------------------
// Content change subscription (for plugins)
// ---------------------------------------------------------------------------

const contentChangeListeners: Set<(markdown: string) => void> = new Set()

/** Subscribe to content change events. Used by PluginContext. */
export function subscribeContentChange(callback: (markdown: string) => void): void {
  contentChangeListeners.add(callback)
}

/** Unsubscribe from content change events. */
export function unsubscribeContentChange(callback: (markdown: string) => void): void {
  contentChangeListeners.delete(callback)
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
 * Check if there is a pending doc transfer (mode switch in progress).
 * Used by editor components to distinguish mode switches from tab switches
 * and avoid incorrectly clearing undo history.
 */
export function hasPendingDocTransfer(): boolean {
  return pendingDocTransfer !== null
}

/**
 * 组合式函数 — 在组件中使用
 * 返回响应式的 mode 和 content
 */
export function useEditorManager() {
  return {
    mode: readonly(mode) as DeepReadonly<Ref<EditorMode>>,
    content: readonly(content) as DeepReadonly<Ref<string>>,
    cursorLine: readonly(cursorLine) as DeepReadonly<Ref<number>>,
    activeHeadingIndex: readonly(activeHeadingIndex) as DeepReadonly<Ref<number>>,
    typewriterMode,
    switchMode,
    cycleMode,
    saveSnapshot,
    restoreFromSnapshot,
    setContent,
    getContent,
    getActiveEditor,
    reportCursorLine,
    reportActiveHeadingIndex,
    syncContent,
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
