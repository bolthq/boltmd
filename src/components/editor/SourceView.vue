<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { EditorState } from '@tiptap/pm/state'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { PMSourceEditor } from '../../core/editor/PMSourceEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'
import { parseMarkdown } from '../../core/editor/parser/MarkdownParser'
import {
  FormatHeading,
  FormatBold,
  FormatItalic,
  FormatStrike,
  FormatCode,
  FormatBulletList,
  FormatOrderedList,
  FormatBlockquote,
  FormatHorizontalRule,
} from '../../core/editor/extensions/FormatAttrs'

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

// Content snapshot taken when this editor is deactivated (v-show pattern).
let contentWhenDeactivated: string | null = null

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
  const schema = getSourceSchema()
  const plugins = PMSourceEditor.createPlugins()
  const state = EditorState.create({ doc: parseMarkdown(schema, markdown), plugins })

  editor = new PMSourceEditor(containerRef.value, state)
  editor.onContentChange((md) => {
    if (props.active === false) return
    emit('change', md)
  })

  // PM's scrollable element
  scrollEl = containerRef.value.querySelector('.ProseMirror') as HTMLElement
    ?? containerRef.value
  scrollEl.addEventListener('scroll', handleScroll, { passive: true })

  containerRef.value.addEventListener('drop', handleDrop)

  // Register to EditorManager (SplitView handles its own registration)
  if (!props.noRegister && props.active !== false) {
    registerEditor(editor)
  }
})

// Watch active prop: register/unregister editor when shown/hidden (v-show pattern).
watch(() => props.active, (isActive) => {
  if (!editor || props.noRegister) return

  if (isActive) {
    const contentActuallyChanged =
      contentWhenDeactivated !== null && props.content !== contentWhenDeactivated
    contentWhenDeactivated = null

    if (contentActuallyChanged && props.content !== undefined) {
      editor.setContent(props.content, true)
    }
    registerEditor(editor)
  } else {
    contentWhenDeactivated = props.content ?? null
    unregisterEditor(editor)
  }
})

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

// ---------------------------------------------------------------------------
// Shared schema (cached singleton)
// ---------------------------------------------------------------------------

let _cachedSchema: any = null

function getSourceSchema() {
  if (_cachedSchema) return _cachedSchema

  _cachedSchema = getSchema([
    StarterKit.configure({
      heading: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      blockquote: false,
      horizontalRule: false,
    }),
    FormatHeading,
    FormatBold,
    FormatItalic,
    FormatStrike,
    FormatCode,
    FormatBulletList,
    FormatOrderedList,
    FormatBlockquote,
    FormatHorizontalRule,
  ])

  return _cachedSchema
}
</script>

<template>
  <div class="source-view" ref="containerRef" />
</template>
