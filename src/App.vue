<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ask } from '@tauri-apps/plugin-dialog'
import EditorContainer from './components/editor/EditorContainer.vue'
import { useEditorManager } from './core/editor/EditorManager'
import { useAutoSave } from './core/editor/useAutoSave'
import { fileName, isDirty, saveFile, openFilePath } from './core/stores/fileStore'

const { mode, cycleMode, setContent } = useEditorManager()
const { stop: stopAutoSave } = useAutoSave()

// 标题栏：「文件名 [*] — BoltMD」
watch(
  [fileName, isDirty],
  ([name, dirty]) => {
    const title = `${name}${dirty ? ' *' : ''} — BoltMD`
    getCurrentWindow().setTitle(title)
  },
  { immediate: true },
)

const demoContent = `# Heading 1

## Heading 2

### Heading 3

This is a paragraph with **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

- [ ] Task unchecked
- [x] Task checked

> This is a blockquote

---

[Link example](https://example.com)

\`\`\`js
function hello() {
  const name = "BoltMD";
  console.log(name);
  return 42;
}
\`\`\`

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
| Cell 7   | Cell 8   | Cell 9   |
`

// 初始化内容
setContent(demoContent)

// 模式名称映射（显示用）
const modeLabels: Record<string, string> = {
  wysiwyg: 'WYSIWYG',
  source: 'Source',
  split: 'Split',
}

// 全局快捷键
function handleKeydown(e: KeyboardEvent) {
  // Ctrl+/ 或 Cmd+/ 循环切换模式
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault()
    cycleMode()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)

  // CLI 参数：启动时若传入文件路径则打开
  const cliFile = await invoke<string | null>('get_cli_file')
  if (cliFile) {
    await openFilePath(cliFile)
  }

  // 关窗拦截：有未保存内容时弹确认框
  getCurrentWindow().onCloseRequested(async (event) => {
    if (!isDirty.value) return
    event.preventDefault()
    const confirmed = await ask(
      `"${fileName.value}" has unsaved changes. Save before closing?`,
      { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Save', cancelLabel: 'Discard' },
    )
    if (confirmed) {
      await saveFile()
    }
    await getCurrentWindow().destroy()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopAutoSave()
})
</script>

<template>
  <div class="app-shell" style="height: 100vh; display: flex; flex-direction: column;">
    <!-- 临时模式指示器（Phase 8 会替换为正式状态栏） -->
    <div class="mode-indicator">
      <span class="mode-label">{{ modeLabels[mode] }}</span>
      <span class="mode-hint">Ctrl+/ to switch</span>
    </div>
    <EditorContainer />
  </div>
</template>

<style scoped>
.mode-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  font-size: 12px;
  flex-shrink: 0;
}

.mode-label {
  color: var(--accent-primary);
  font-weight: 600;
  font-family: var(--font-mono);
}

.mode-hint {
  color: var(--text-muted);
}
</style>
