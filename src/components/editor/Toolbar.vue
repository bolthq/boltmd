<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote, Minus, CodeSquare,
  Undo2, Redo2, RemoveFormatting, TableIcon, ImageIcon, Link,
} from 'lucide-vue-next'
import { getTiptapEditor } from '../../core/editor/EditorManager'

// 强制刷新计数（Tiptap selectionUpdate 时递增）
const tick = ref(0)
let selectionHandler: (() => void) | null = null
let lastEditorId: unknown = null

function ensureSelectionListener() {
  const editor = getTiptapEditor()
  if (editor && editor !== lastEditorId) {
    lastEditorId = editor
    selectionHandler = () => { tick.value++ }
    editor.on('selectionUpdate', selectionHandler)
    editor.on('update', selectionHandler)
  }
}

// 定时检查编辑器实例（处理模式切换后重新挂载的情况）
let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  ensureSelectionListener()
  pollTimer = setInterval(ensureSelectionListener, 500)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  // 不需要手动 off，编辑器销毁时自动清理
  lastEditorId = null
  selectionHandler = null
})

// 检查某个格式是否激活
function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  void tick.value // 触发响应式依赖
  const editor = getTiptapEditor()
  if (!editor) return false
  return editor.isActive(name, attrs)
}

// 执行格式化命令
function exec(callback: () => void) {
  callback()
}

function toggleBold() { exec(() => getTiptapEditor()?.chain().focus().toggleBold().run()) }
function toggleItalic() { exec(() => getTiptapEditor()?.chain().focus().toggleItalic().run()) }
function toggleStrike() { exec(() => getTiptapEditor()?.chain().focus().toggleStrike().run()) }
function toggleCode() { exec(() => getTiptapEditor()?.chain().focus().toggleCode().run()) }
function toggleHeading(level: 1 | 2 | 3) { exec(() => getTiptapEditor()?.chain().focus().toggleHeading({ level }).run()) }
function toggleBulletList() { exec(() => getTiptapEditor()?.chain().focus().toggleBulletList().run()) }
function toggleOrderedList() { exec(() => getTiptapEditor()?.chain().focus().toggleOrderedList().run()) }
function toggleTaskList() { exec(() => getTiptapEditor()?.chain().focus().toggleTaskList().run()) }
function toggleBlockquote() { exec(() => getTiptapEditor()?.chain().focus().toggleBlockquote().run()) }
function setHorizontalRule() { exec(() => getTiptapEditor()?.chain().focus().setHorizontalRule().run()) }
function toggleCodeBlock() { exec(() => getTiptapEditor()?.chain().focus().toggleCodeBlock().run()) }
function clearFormatting() { exec(() => getTiptapEditor()?.chain().focus().clearNodes().unsetAllMarks().run()) }
function undoAction() { exec(() => getTiptapEditor()?.chain().focus().undo().run()) }
function redoAction() { exec(() => getTiptapEditor()?.chain().focus().redo().run()) }

function insertTable() {
  exec(() => getTiptapEditor()?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())
}

function insertImage() {
  const url = window.prompt('Image URL:')
  if (url) {
    exec(() => getTiptapEditor()?.chain().focus().setImage({ src: url }).run())
  }
}

function insertLink() {
  const editor = getTiptapEditor()
  if (!editor) return
  const previousUrl = editor.getAttributes('link').href ?? ''
  const url = window.prompt('Link URL:', previousUrl)
  if (url === null) return
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
}

// 按钮配置
const groups = [
  {
    items: [
      { icon: Undo2, action: undoAction, title: 'Undo', active: () => false },
      { icon: Redo2, action: redoAction, title: 'Redo', active: () => false },
    ],
  },
  {
    items: [
      { icon: Bold, action: toggleBold, title: 'Bold', active: () => isActive('bold') },
      { icon: Italic, action: toggleItalic, title: 'Italic', active: () => isActive('italic') },
      { icon: Strikethrough, action: toggleStrike, title: 'Strikethrough', active: () => isActive('strike') },
      { icon: Code, action: toggleCode, title: 'Inline Code', active: () => isActive('code') },
    ],
  },
  {
    items: [
      { icon: Heading1, action: () => toggleHeading(1), title: 'Heading 1', active: () => isActive('heading', { level: 1 }) },
      { icon: Heading2, action: () => toggleHeading(2), title: 'Heading 2', active: () => isActive('heading', { level: 2 }) },
      { icon: Heading3, action: () => toggleHeading(3), title: 'Heading 3', active: () => isActive('heading', { level: 3 }) },
    ],
  },
  {
    items: [
      { icon: List, action: toggleBulletList, title: 'Bullet List', active: () => isActive('bulletList') },
      { icon: ListOrdered, action: toggleOrderedList, title: 'Ordered List', active: () => isActive('orderedList') },
      { icon: ListChecks, action: toggleTaskList, title: 'Task List', active: () => isActive('taskList') },
    ],
  },
  {
    items: [
      { icon: Quote, action: toggleBlockquote, title: 'Blockquote', active: () => isActive('blockquote') },
      { icon: CodeSquare, action: toggleCodeBlock, title: 'Code Block', active: () => isActive('codeBlock') },
      { icon: Minus, action: setHorizontalRule, title: 'Horizontal Rule', active: () => false },
    ],
  },
  {
    items: [
      { icon: TableIcon, action: insertTable, title: 'Insert Table', active: () => false },
      { icon: ImageIcon, action: insertImage, title: 'Insert Image', active: () => false },
      { icon: Link, action: insertLink, title: 'Insert Link', active: () => isActive('link') },
    ],
  },
  {
    items: [
      { icon: RemoveFormatting, action: clearFormatting, title: 'Clear Formatting', active: () => false },
    ],
  },
]
</script>

<template>
  <div class="toolbar">
    <template v-for="(group, gi) in groups" :key="gi">
      <div class="toolbar-group">
        <button
          v-for="(btn, bi) in group.items"
          :key="bi"
          class="toolbar-btn"
          :class="{ 'toolbar-btn-active': btn.active() }"
          :title="btn.title"
          @click="btn.action"
        >
          <component :is="btn.icon" :size="16" :stroke-width="1.8" />
        </button>
      </div>
      <span v-if="gi < groups.length - 1" class="toolbar-sep" />
    </template>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
  user-select: none;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 2px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border-primary);
  margin: 0 4px;
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toolbar-btn-active {
  background: var(--bg-active);
  color: var(--accent-primary);
}

.toolbar-btn-active:hover {
  background: var(--bg-active);
  color: var(--accent-primary);
}
</style>
