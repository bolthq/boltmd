<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions, WysiwygEditor } from '../../core/editor/WysiwygEditor'
import { registerEditor, unregisterEditor } from '../../core/editor/EditorManager'
import { imageService } from '../../core/services/ImageService'
import { activeTab } from '../../core/stores/tabStore'
import type { IEditor } from '../../core/editor/types'

const props = defineProps<{
  content?: string
}>()

const emit = defineEmits<{
  change: [content: string]
}>()

let editorWrapper: IEditor | null = null

const tiptapEditor = useEditor({
  extensions: createWysiwygExtensions(),
  content: props.content ?? '',
  onCreate({ editor }) {
    // Tiptap 创建完成后，包装为 IEditor 并注册
    editorWrapper = new WysiwygEditor(editor)
    editorWrapper.onContentChange((md) => emit('change', md))
    registerEditor(editorWrapper)
  },
  editorProps: {
    handlePaste(_view, event) {
      const items = event.clipboardData?.items
      if (!items) return false

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const blob = item.getAsFile()
          if (!blob) return true
          const filePath = activeTab.value?.filePath ?? null
          imageService.handlePasteImage(blob, filePath).then((src) => {
            if (src && tiptapEditor.value) {
              tiptapEditor.value.chain().focus().setImage({ src }).run()
            }
          })
          return true
        }
      }
      return false
    },
  },
})

// 外部 content prop 变化时同步到编辑器
watch(() => props.content, (newContent) => {
  if (newContent !== undefined && tiptapEditor.value) {
    const current = (tiptapEditor.value.storage as any).markdown?.getMarkdown() ?? ''
    if (newContent !== current) {
      tiptapEditor.value.commands.setContent(newContent)
    }
  }
})

onUnmounted(() => {
  if (editorWrapper) {
    unregisterEditor(editorWrapper)
    editorWrapper = null
  }
  tiptapEditor.value?.destroy()
})
</script>

<template>
  <div class="editor-core">
    <EditorContent class="editor-mount" :editor="tiptapEditor" />
  </div>
</template>
