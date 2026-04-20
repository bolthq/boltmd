import { ref, readonly } from 'vue'
import { fileService } from '../services/FileService'
import { errorService } from '../services/ErrorService'
import { ErrorLevel } from '../services/ErrorService'

// ── 状态 ────────────────────────────────────────────────────────────────────

const _path = ref<string | null>(null)
const _name = ref<string>('untitled.md')
const _content = ref<string>('')
const _encoding = ref<string>('UTF-8')
const _dirty = ref<boolean>(false)
const _lastSaved = ref<number | null>(null)

// ── 只读导出 ─────────────────────────────────────────────────────────────────

export const filePath = readonly(_path)
export const fileName = readonly(_name)
export const fileContent = readonly(_content)
export const fileEncoding = readonly(_encoding)
export const isDirty = readonly(_dirty)
export const lastSaved = readonly(_lastSaved)

// ── 内部工具 ─────────────────────────────────────────────────────────────────

function applyFileInfo(info: { path: string | null; name: string; content: string; encoding: string }) {
  _path.value = info.path
  _name.value = info.name
  _content.value = info.content
  _encoding.value = info.encoding
  _dirty.value = false
  _lastSaved.value = Date.now()
}

// ── 动作 ─────────────────────────────────────────────────────────────────────

/** 标记内容已修改（由编辑器 onChange 调用） */
export function markDirty(content: string): void {
  _content.value = content
  _dirty.value = true
}

/** 弹出打开对话框，加载文件 */
export async function openFile(): Promise<boolean> {
  try {
    const info = await fileService.openFile()
    if (!info) return false
    applyFileInfo(info)
    return true
  } catch (e) {
    errorService.report({
      level: ErrorLevel.Error,
      message: 'Failed to open file',
      detail: String(e),
      source: 'fileStore',
    })
    return false
  }
}

/** 直接按路径打开文件 */
export async function openFilePath(path: string): Promise<boolean> {
  try {
    const info = await fileService.openFilePath(path)
    applyFileInfo(info)
    return true
  } catch (e) {
    errorService.report({
      level: ErrorLevel.Error,
      message: `Failed to open file: ${path}`,
      detail: String(e),
      source: 'fileStore',
    })
    return false
  }
}

/** 保存到当前路径；若无路径则触发另存为 */
export async function saveFile(): Promise<boolean> {
  if (_path.value) {
    try {
      await fileService.saveFile(_path.value, _content.value)
      _dirty.value = false
      _lastSaved.value = Date.now()
      return true
    } catch (e) {
      errorService.report({
        level: ErrorLevel.Error,
        message: 'Failed to save file',
        detail: String(e),
        source: 'fileStore',
      })
      return false
    }
  }
  return saveFileAs()
}

/** 弹出另存为对话框 */
export async function saveFileAs(): Promise<boolean> {
  try {
    const newPath = await fileService.saveFileAs(_content.value)
    if (!newPath) return false
    const name = newPath.split(/[\\/]/).pop() ?? 'untitled.md'
    _path.value = newPath
    _name.value = name
    _dirty.value = false
    _lastSaved.value = Date.now()
    return true
  } catch (e) {
    errorService.report({
      level: ErrorLevel.Error,
      message: 'Failed to save file',
      detail: String(e),
      source: 'fileStore',
    })
    return false
  }
}

/** 新建空白文件 */
export function newFile(): void {
  const info = fileService.newFile()
  applyFileInfo(info)
  _lastSaved.value = null
}
