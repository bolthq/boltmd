<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEditorManager, syncContent } from '../../core/editor/EditorManager'
import { activeTabId, updateTabContent, normalizeTabCleanContent } from '../../core/stores/tabStore'
import { isFileLoading } from '../../core/stores/fileStore'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ask } from '@tauri-apps/plugin-dialog'
import FindReplacePanel from '../common/FindReplacePanel.vue'

// Skeleton placeholder rendered while the heavy editor chunk is loading.
// Keeps the layout stable and gives instant visual feedback.
const EditorSkeleton = {
  render() {
    return h('div', { class: 'editor-skeleton' }, [
      h('div', { class: 'editor-skeleton-line wide' }),
      h('div', { class: 'editor-skeleton-line medium' }),
      h('div', { class: 'editor-skeleton-line narrow' }),
      h('div', { class: 'editor-skeleton-line medium' }),
      h('div', { class: 'editor-skeleton-line wide' }),
    ])
  },
}

// Async-load editor views so tiptap chunks are not required
// for the initial render.  The UI shell (title bar, menu, tab bar) appears
// instantly while the editor JS is fetched in the background.
const EditorCore = defineAsyncComponent({
  loader: () => import('./EditorCore.vue'),
  loadingComponent: EditorSkeleton,
  delay: 0,
})
const SourceView = defineAsyncComponent({
  loader: () => import('./SourceView.vue'),
  loadingComponent: EditorSkeleton,
  delay: 0,
})

const { mode, content, getSelectionInEditor } = useEditorManager()
const { t } = useI18n()

// EditorCore (Tiptap) is always mounted — it holds the canonical document tree.
// It's visible in WYSIWYG mode and in split mode (right pane, read-only).
// It's the active IEditor only in WYSIWYG mode.
const editorCoreActive = computed(() => mode.value === 'wysiwyg')
const editorCoreReadonly = computed(() => mode.value === 'split')
const editorCoreVisible = computed(() => mode.value === 'wysiwyg' || mode.value === 'split')

// SourceView is mounted when needed (source or split mode).
// It's the active IEditor in source and split modes (the user types in source view).
const sourceMounted = ref(false)
const sourceVisible = computed(() => mode.value === 'source' || mode.value === 'split')
const sourceActive = computed(() => mode.value === 'source' || mode.value === 'split')

// Flip sourceMounted once we first need it.
const _stopSourceWatch = watch(sourceVisible, (visible) => {
  if (visible && !sourceMounted.value) {
    sourceMounted.value = true
    Promise.resolve().then(() => _stopSourceWatch())
  }
}, { immediate: true })

// Split mode uses a CSS flex layout class on the container.
const isSplit = computed(() => mode.value === 'split')

// ---- Split mode: synchronized scrolling (source → preview only) ----
const wysiwygPaneRef = ref<HTMLElement | null>(null)

/**
 * Get the actual scrollable element inside the WYSIWYG pane.
 * The scroll container is the .editor-mount div inside EditorCore.
 */
function getWysiwygScrollEl(): HTMLElement | null {
  return wysiwygPaneRef.value?.querySelector('.editor-mount') as HTMLElement | null
}

function onSourceScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
  if (!isSplit.value) return
  const wysiwygEl = getWysiwygScrollEl()
  if (!wysiwygEl) return

  const maxScroll = scrollHeight - clientHeight
  const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0

  wysiwygEl.scrollTop = ratio * (wysiwygEl.scrollHeight - wysiwygEl.clientHeight)
}

// Find/replace panel state
const findPanelMode = ref<'find' | 'replace' | null>(null)
const findPanelRef = ref<InstanceType<typeof FindReplacePanel> | null>(null)
const findPanelInitialQuery = ref('')

// Grab the editor's current selection and return it only when it's a
// non-empty, single-line string — multi-line selections are rarely what
// the user wants in a find box and would make the input grow awkwardly.
function readSinglelineSelection(): string {
  const sel = getSelectionInEditor()
  if (!sel) return ''
  if (sel.includes('\n') || sel.includes('\r')) return ''
  return sel
}

function openFind() {
  const prefill = readSinglelineSelection()
  if (findPanelMode.value === 'find') {
    findPanelRef.value?.focus(prefill)
  } else {
    findPanelInitialQuery.value = prefill
    findPanelMode.value = 'find'
  }
}

function openReplace() {
  const prefill = readSinglelineSelection()
  if (findPanelMode.value === 'replace') {
    findPanelRef.value?.focus(prefill)
  } else {
    findPanelInitialQuery.value = prefill
    findPanelMode.value = 'replace'
  }
}

function closeFindPanel() {
  findPanelMode.value = null
  findPanelInitialQuery.value = ''
}

function handleModeChange(m: 'find' | 'replace') {
  findPanelMode.value = m
}

function handleChange(newContent: string) {
  const tabId = activeTabId.value
  if (tabId) {
    updateTabContent(tabId, newContent)
  }
  // Keep EditorManager content ref in sync for observers (OutlinePanel, etc.)
  syncContent(newContent)
}

/**
 * Called by EditorCore after it first processes content (onCreate or setContent).
 * Updates cleanContent so that serialization normalization differences
 * (e.g. blank line insertion, table column padding) don't cause false dirty flags.
 */
function handleNormalize(normalizedContent: string) {
  const tabId = activeTabId.value
  if (tabId) {
    normalizeTabCleanContent(tabId, normalizedContent)
  }
}

// Global shortcuts: Ctrl+F / Ctrl+H open our panel; Ctrl+G / F3 are swallowed
// so the Webview's find-in-page popup can't hijack them.
function handleGlobalKeydown(e: KeyboardEvent) {
  // F3 / Shift+F3: next / previous match when panel is open
  if (e.key === 'F3') {
    e.preventDefault()
    e.stopPropagation()
    if (findPanelMode.value === null) {
      openFind()
    }
    return
  }

  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    e.stopPropagation()
    openFind()
    return
  }
  if ((e.key === 'h' || e.key === 'H') && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    openReplace()
    return
  }
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault()
    e.stopPropagation()
    if (findPanelMode.value === null) {
      openFind()
    }
    return
  }
}

// ---- Link click interception ----
// Intercept clicks on <a> tags inside the editor to prevent in-app navigation.
// Only triggers in non-editable contexts (readonly preview, htmlBlock nodes).
// Shows a confirmation dialog and opens in the system's default browser.
const editorContainerRef = ref<HTMLElement | null>(null)

function handleEditorClick(e: MouseEvent) {
  // Walk up from the click target to find an <a> element within the editor.
  const target = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null
  if (!target) return

  const href = target.getAttribute('href')
  if (!href) return

  // Only intercept external links (http/https). Ignore anchor-only links.
  if (!href.startsWith('http://') && !href.startsWith('https://')) return

  // Only intercept in non-editable contexts:
  // 1. Readonly editor (split mode preview pane) — .ProseMirror[contenteditable="false"]
  // 2. Inside htmlBlock atom nodes (.html-block-view) which are always non-editable
  const inHtmlBlock = target.closest('.html-block-view') !== null
  const inReadonlyEditor = target.closest('.ProseMirror[contenteditable="false"]') !== null
  if (!inHtmlBlock && !inReadonlyEditor) return

  // Prevent the browser/webview from navigating.
  e.preventDefault()
  e.stopPropagation()

  // Show confirmation dialog, then open externally.
  ask(t('editor.linkConfirmMessage', { url: href }), {
    title: t('editor.linkConfirmTitle'),
    kind: 'info',
    okLabel: t('editor.linkOpen'),
    cancelLabel: t('editor.linkCancel'),
  }).then((confirmed) => {
    if (confirmed) {
      openUrl(href).catch((err) => {
        console.error('[EditorContainer] Failed to open URL:', err)
      })
    }
  })
}

// Use capture phase so we see Ctrl+F before PM's internal keymap handlers.
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, { capture: true })
  editorContainerRef.value?.addEventListener('click', handleEditorClick, { capture: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, { capture: true })
  editorContainerRef.value?.removeEventListener('click', handleEditorClick, { capture: true })
})

defineExpose({
  openFind,
  openReplace,
})
</script>

<template>
  <div ref="editorContainerRef" class="editor-container" :class="{ 'split-layout': isSplit }">
    <!-- Loading overlay shown while a file is being read from disk -->
    <div v-if="isFileLoading" class="editor-loading-overlay">
      <div class="editor-loading-spinner" />
      <span class="editor-loading-text">{{ t('editor.loading') }}</span>
    </div>

    <!-- Canonical Tiptap editor (full in WYSIWYG, right pane in split).
         Always mounted first to ensure getTiptapEditor() is available
         before SourceView mounts (source mode needs it for syncToCanonical). -->
    <div v-show="editorCoreVisible" ref="wysiwygPaneRef" class="split-pane wysiwyg-pane" :class="{ 'order-2': isSplit }">
      <EditorCore
        :content="content"
        :active="editorCoreActive"
        :readonly="editorCoreReadonly"
        @change="handleChange"
        @normalize="handleNormalize"
      />
    </div>

    <!-- Source editor (left pane in split, full in source mode) -->
    <div v-if="sourceMounted" v-show="sourceVisible" class="split-pane source-pane" :class="{ 'order-1': isSplit }">
      <SourceView
        :content="content"
        :active="sourceActive"
        @change="handleChange"
        @scroll="onSourceScroll"
      />
    </div>

    <!-- Split divider (positioned between source and wysiwyg via order) -->
    <div v-if="isSplit" class="split-divider order-divider" />

    <!-- Find/Replace panel (floating) -->
    <FindReplacePanel
      v-if="findPanelMode !== null"
      ref="findPanelRef"
      :mode="findPanelMode"
      :initial-query="findPanelInitialQuery"
      @close="closeFindPanel"
      @mode-change="handleModeChange"
    />
  </div>
</template>
