<script setup lang="ts">
import { useEditorManager } from '../../core/editor/EditorManager'
import { activeTabId, updateTabContent } from '../../core/stores/tabStore'
import EditorCore from './EditorCore.vue'
import SourceView from './SourceView.vue'
import SplitView from './SplitView.vue'

const { mode, content } = useEditorManager()

function handleChange(newContent: string) {
  const tabId = activeTabId.value
  if (tabId) {
    updateTabContent(tabId, newContent)
  }
}
</script>

<template>
  <div class="editor-container">
    <!-- WYSIWYG 模式 -->
    <EditorCore
      v-if="mode === 'wysiwyg'"
      :content="content"
      @change="handleChange"
    />

    <!-- 源码模式 -->
    <SourceView
      v-if="mode === 'source'"
      :content="content"
      @change="handleChange"
    />

    <!-- 分屏模式 -->
    <SplitView
      v-if="mode === 'split'"
      :content="content"
      @change="handleChange"
    />
  </div>
</template>
