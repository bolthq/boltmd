<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  extensions: [StarterKit],
  content: '<p>开始写作...</p>',
})
</script>

<template>
  <div class="editor-core">
    <EditorContent :editor="editor" />
  </div>
</template>
