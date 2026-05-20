/**
 * SharedDispatch — Shared dispatchTransaction for dual-view synchronization.
 *
 * When either the WYSIWYG view or the source view dispatches a transaction,
 * this function applies it to the current state and pushes the resulting new
 * state to BOTH views, keeping them synchronized.
 *
 * This is the core mechanism that allows two EditorViews to operate on the
 * same EditorState without PM's automatic (and absent) multi-view sync.
 */

import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { setTabState, getActiveTabId, getTabState } from './TabEditorState'

// ---------------------------------------------------------------------------
// View registry
// ---------------------------------------------------------------------------

/** References to the two views. Set during initialization. */
let wysiwygView: EditorView | null = null
let sourceView: EditorView | null = null

/** Callback invoked after each state update (for content sync, word count, etc.) */
type StateUpdateCallback = (state: EditorState) => void
const stateUpdateCallbacks: StateUpdateCallback[] = []

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the WYSIWYG EditorView. Called once during app initialization.
 */
export function registerWysiwygView(view: EditorView): void {
  wysiwygView = view
}

/**
 * Register the source EditorView. Called once during app initialization.
 */
export function registerSourceView(view: EditorView): void {
  sourceView = view
}

/**
 * Unregister views (for teardown).
 */
export function unregisterViews(): void {
  wysiwygView = null
  sourceView = null
}

/**
 * Get the WYSIWYG view reference.
 */
export function getWysiwygView(): EditorView | null {
  return wysiwygView
}

/**
 * Get the source view reference.
 */
export function getSourceView(): EditorView | null {
  return sourceView
}

/**
 * Subscribe to state updates. The callback receives the new state after
 * every transaction. Used for content sync, word count, cursor reporting, etc.
 */
export function onStateUpdate(callback: StateUpdateCallback): void {
  stateUpdateCallbacks.push(callback)
}

/**
 * Remove a state update callback.
 */
export function offStateUpdate(callback: StateUpdateCallback): void {
  const index = stateUpdateCallbacks.indexOf(callback)
  if (index >= 0) stateUpdateCallbacks.splice(index, 1)
}

/**
 * The shared dispatchTransaction function.
 *
 * This should be set as the `dispatchTransaction` option on both EditorViews.
 * It applies the transaction, updates both views, and stores the new state
 * in the tab state map.
 *
 * @param originView - The view that originated the transaction (to avoid
 *                     double-updating). Pass null to update both views.
 */
export function createSharedDispatch(originView: EditorView | null) {
  return function sharedDispatch(tr: Transaction): void {
    if (!originView) return

    // Apply transaction to get new state
    const newState = originView.state.apply(tr)

    // Update the originating view
    originView.updateState(newState)

    // Update the other view (if registered and different from origin)
    if (wysiwygView && wysiwygView !== originView) {
      wysiwygView.updateState(newState)
    }
    if (sourceView && sourceView !== originView) {
      sourceView.updateState(newState)
    }

    // Store updated state in tab state map
    const tabId = getActiveTabId()
    if (tabId) {
      const existing = getTabState(tabId)
      setTabState(tabId, {
        editorState: newState,
        scrollTop: existing?.scrollTop ?? 0,
      })
    }

    // Notify subscribers
    for (const cb of stateUpdateCallbacks) {
      try {
        cb(newState)
      } catch (err) {
        console.error('[SharedDispatch] Error in state update callback:', err)
      }
    }
  }
}

/**
 * Create a dispatch function bound to the WYSIWYG view.
 * Used as Tiptap Editor's dispatchTransaction override.
 */
export function createWysiwygDispatch(): (tr: Transaction) => void {
  return function wysiwygDispatch(tr: Transaction): void {
    if (!wysiwygView) return
    createSharedDispatch(wysiwygView)(tr)
  }
}

/**
 * Create a dispatch function bound to the source view.
 * Used as the raw PM EditorView's dispatchTransaction.
 */
export function createSourceDispatch(): (tr: Transaction) => void {
  return function sourceDispatch(tr: Transaction): void {
    if (!sourceView) return
    createSharedDispatch(sourceView)(tr)
  }
}
