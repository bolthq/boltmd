/**
 * TabEditorState — Manages per-tab ProseMirror EditorState instances.
 *
 * Each tab has an independent EditorState (doc + history + selection).
 * This module provides:
 * - createTabState(): build a fresh EditorState from markdown text
 * - getTabState() / setTabState(): store and retrieve states per tab ID
 * - switchTabState(): swap the active tab's state (for use with EditorView.updateState())
 *
 * This is the foundation for the unified editor architecture where tab
 * switching is instant (updateState) rather than serialize → destroy → rebuild.
 */

import { EditorState as PMEditorState } from '@tiptap/pm/state'
import type { Schema } from '@tiptap/pm/model'
import { parseMarkdown } from '../parser/MarkdownParser'
import { serializeMarkdown } from '../serializer/MarkdownSerializer'

// ---------------------------------------------------------------------------
// Tab state storage
// ---------------------------------------------------------------------------

/** Stored state per tab, including mode-specific metadata. */
export interface TabState {
  /** The ProseMirror EditorState (doc + history + selection). */
  editorState: PMEditorState
  /** Scroll position for the active view. */
  scrollTop: number
}

/** Map of tab ID → TabState */
const tabStates = new Map<string, TabState>()

/** Currently active tab ID */
let activeTabId: string | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a tab's EditorState. Called after every transaction so the
 * state is always up-to-date for instant switching.
 */
export function setTabState(tabId: string, state: TabState): void {
  tabStates.set(tabId, state)
}

/**
 * Retrieve a tab's stored state. Returns undefined if the tab hasn't
 * been initialized yet.
 */
export function getTabState(tabId: string): TabState | undefined {
  return tabStates.get(tabId)
}

/**
 * Remove a tab's state (when the tab is closed).
 */
export function removeTabState(tabId: string): void {
  tabStates.delete(tabId)
}

/**
 * Get the currently active tab ID.
 */
export function getActiveTabId(): string | null {
  return activeTabId
}

/**
 * Set the active tab ID. Does NOT perform view update — that's the
 * caller's responsibility (call view.updateState() with the tab's state).
 */
export function setActiveTabId(tabId: string): void {
  activeTabId = tabId
}

/**
 * Check if a tab has stored state.
 */
export function hasTabState(tabId: string): boolean {
  return tabStates.has(tabId)
}

/**
 * Get all stored tab IDs (for debugging/cleanup).
 */
export function getAllTabIds(): string[] {
  return Array.from(tabStates.keys())
}

// ---------------------------------------------------------------------------
// State creation helpers
// ---------------------------------------------------------------------------

/**
 * Create a fresh EditorState from markdown text using the given schema
 * and plugins. This is used when opening a new tab or initializing a
 * tab's state from file content.
 *
 * @param schema - The ProseMirror schema
 * @param plugins - The EditorState plugins (history, keymap, etc.)
 * @param markdown - The markdown content to parse
 * @returns A new EditorState
 */
export function createStateFromMarkdown(
  schema: Schema,
  plugins: any[],
  markdown: string,
): PMEditorState {
  const doc = parseMarkdown(schema, markdown)
  return PMEditorState.create({ doc, plugins })
}

/**
 * Serialize the document in a tab's state to markdown text.
 * Used for file saving, content export, etc.
 */
export function serializeTabContent(tabId: string): string {
  const tabState = tabStates.get(tabId)
  if (!tabState) return ''
  return serializeMarkdown(tabState.editorState.doc)
}

/**
 * Serialize a given EditorState's document to markdown.
 */
export function serializeState(state: PMEditorState): string {
  return serializeMarkdown(state.doc)
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Clear all stored tab states. Used during app teardown or reset.
 */
export function clearAllTabStates(): void {
  tabStates.clear()
  activeTabId = null
}
