<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { PMSourceEditor } from '../../core/editor/PMSourceEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'

const props = defineProps<{
  content?: string
  /** When true, don't register to EditorManager (used inside SplitView) */
  noRegister?: boolean
  /** When using v-show pattern, indicates whether this editor is the active mode. */
  active?: boolean
}>()

const emit = defineEmits<{
  change: [content: string]
  scroll: [scrollTop: number, scrollHeight: number, clientHeight: number]
}>()

const containerRef = ref<HTMLElement | null>(null)
let editor: PMSourceEditor | null = null
let scrollEl: HTMLElement | null = null

function handleScroll() {
  if (!scrollEl) return
  emit('scroll', scrollEl.scrollTop, scrollEl.scrollHeight, scrollEl.clientHeight)
}

function handleDrop(event: DragEvent) {
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
  if (!imageFile) return

  event.preventDefault()
  // TODO: Integrate image drop with PMSourceEditor once ImageService is wired
}

onMounted(() => {
  if (!containerRef.value) return

  const markdown = props.content ?? ''

  editor = new PMSourceEditor(containerRef.value, markdown)
  editor.onContentChange((md) => {
    if (props.active === false) return
    emit('change', md)
  })

  // The scrollable element is the .source-view container itself (overflow-y: auto).
  scrollEl = containerRef.value
  scrollEl.addEventListener('scroll', handleScroll, { passive: true })

  containerRef.value.addEventListener('drop', handleDrop)

  // Register to EditorManager (SplitView handles its own registration)
  if (!props.noRegister && props.active !== false) {
    registerEditor(editor)
  }
})

// Watch content prop: sync external content changes (e.g. tab switch, file reload)
// when this editor is active. When becoming active via docTransfer, the transfer
// takes priority (registerEditor handles it) so we skip if content matches.
watch(() => props.content, (newContent) => {
  if (!editor || props.active === false) return
  if (newContent === undefined) return
  if (newContent === editor.getContent()) return
  editor.setContent(newContent)
})

// Whether this editor was active on the previous render cycle. Used to detect
// the inactive→active transition for content sync on tab switch.
let wasActive = props.active !== false

// Watch active prop: register/unregister editor when shown/hidden (v-show pattern).
// Use flush: 'post' to ensure DOM is visible (v-show applied) before we register,
// so PM decorations (cursor flash) render correctly on a visible element.
watch(() => props.active, (isActive) => {
  if (!editor || props.noRegister) return

  if (isActive) {
    // When becoming active after a tab switch, ensure content matches props.content.
    // This handles the case where content was updated by restoreFromSnapshot while
    // this editor was inactive (props.active=false), causing the content watcher to skip.
    if (props.content !== undefined && !wasActive) {
      const currentMd = editor.getContent()
      if (currentMd !== props.content) {
        editor.setContent(props.content)
      }
    }
    registerEditor(editor)
  } else {
    unregisterEditor(editor)
  }

  wasActive = !!isActive
}, { flush: 'post' })

onUnmounted(() => {
  scrollEl?.removeEventListener('scroll', handleScroll)
  containerRef.value?.removeEventListener('drop', handleDrop)
  if (editor) {
    if (!props.noRegister) {
      unregisterEditor(editor)
    }
    editor.destroy()
    editor = null
  }
})

// Expose editor instance to parent components
defineExpose({ editor: () => editor })
</script>

<template>
  <div class="source-view" ref="containerRef" />
</template>
