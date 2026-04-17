<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { createWysiwygExtensions } from '../../core/editor/WysiwygEditor'

const editor = useEditor({
  extensions: createWysiwygExtensions(),
  content: '# Welcome to BoltMD\n\nStart writing **Markdown** here.\n\n- Item 1\n- Item 2\n\n> A blockquote\n\n```js\nconsole.log("hello")\n```\n',
})
</script>

<template>
  <div class="editor-core">
    <EditorContent class="editor-mount" :editor="editor" />
  </div>
</template>
