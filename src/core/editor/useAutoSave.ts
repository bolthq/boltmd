import { watch } from 'vue'
import { isDirty, fileContent, filePath, saveFile } from '../stores/fileStore'
import { configService } from '../services/ConfigService'

/**
 * 自动保存 composable。
 * 在组件 onMounted 时调用，返回 stop 函数用于清理。
 */
export function useAutoSave(): { stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule() {
    clearTimer()
    const enabled = configService.get('autoSave')
    if (!enabled) return
    // 仅对已有路径的文件自动保存（新建未保存的文件不自动保存）
    if (!filePath.value) return

    const delay = configService.get('autoSaveDelay')
    timer = setTimeout(async () => {
      timer = null
      if (isDirty.value) {
        await saveFile()
      }
    }, delay)
  }

  // 监听内容变化触发调度
  const stopWatch = watch([isDirty, fileContent], ([dirty]) => {
    if (dirty) schedule()
    else clearTimer()
  })

  // 监听配置变化：autoSave 或 autoSaveDelay 改变时重新调度
  configService.onChange('autoSave', () => {
    if (isDirty.value) schedule()
    else clearTimer()
  })
  configService.onChange('autoSaveDelay', () => {
    if (isDirty.value) schedule()
  })

  function stop() {
    clearTimer()
    stopWatch()
  }

  return { stop }
}
