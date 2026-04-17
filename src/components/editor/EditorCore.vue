<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions } from '../../core/editor/WysiwygEditor'

const editor = useEditor({
  extensions: createWysiwygExtensions(),
  content: '<p>开始写作...</p>',
})
</script>

<template>
  <div class="editor-core">
    <EditorContent class="editor-mount" :editor="editor" />
  </div>
</template>
