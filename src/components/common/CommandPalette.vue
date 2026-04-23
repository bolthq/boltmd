<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

export interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

const props = defineProps<{
  commands: Command[]
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// 搜索过滤：按 label 模糊匹配
const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q) return props.commands
  return props.commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(q)
  )
})

// 执行选中的命令
function execute(cmd: Command) {
  emit('close')
  // 延迟执行，让面板先关闭
  requestAnimationFrame(() => cmd.action())
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1)
    scrollToSelected()
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    scrollToSelected()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filtered.value[selectedIndex.value]
    if (cmd) execute(cmd)
    return
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector('.palette-item-active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

// 输入变化时重置选中索引
function handleInput() {
  selectedIndex.value = 0
}

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('palette-overlay')) {
    emit('close')
  }
}

onMounted(() => {
  nextTick(() => inputRef.value?.focus())
})
</script>

<template>
  <div class="palette-overlay" @click="handleOverlayClick" @keydown="handleKeydown">
    <div class="palette-panel">
      <!-- 搜索框 -->
      <div class="palette-input-wrap">
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          :placeholder="t('commands.placeholder')"
          @input="handleInput"
        />
      </div>

      <!-- 命令列表 -->
      <div class="palette-list" v-if="filtered.length > 0">
        <div
          v-for="(cmd, i) in filtered"
          :key="cmd.id"
          class="palette-item"
          :class="{ 'palette-item-active': i === selectedIndex }"
          @click="execute(cmd)"
          @mouseenter="selectedIndex = i"
        >
          <span class="palette-label">{{ cmd.label }}</span>
          <kbd v-if="cmd.shortcut" class="palette-shortcut">{{ cmd.shortcut }}</kbd>
        </div>
      </div>
      <div class="palette-empty" v-else>
        {{ t('commands.noMatch') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 80px;
  z-index: 1100;
}

.palette-panel {
  width: 500px;
  max-height: 400px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-input-wrap {
  padding: 12px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.palette-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.palette-input:focus {
  border-color: var(--accent-primary);
}

.palette-input::placeholder {
  color: var(--text-muted);
}

.palette-list {
  overflow-y: auto;
  padding: 4px 0;
}

.palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
}

.palette-item:hover,
.palette-item-active {
  background: var(--bg-hover);
}

.palette-label {
  font-size: 13px;
  color: var(--text-primary);
}

.palette-shortcut {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 3px;
  color: var(--text-muted);
}

.palette-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
