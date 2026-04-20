import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { FileInfo } from '../types/file'

export interface IFileService {
  openFile(): Promise<FileInfo | null>
  openFilePath(path: string): Promise<FileInfo>
  saveFile(path: string, content: string): Promise<void>
  saveFileAs(content: string): Promise<string | null>
  newFile(): FileInfo
}

/** Rust 返回的原始结构（path 始终为 string） */
interface RustFileInfo {
  path: string
  name: string
  content: string
  encoding: string
  last_modified: number
}

function fromRust(r: RustFileInfo): FileInfo {
  return {
    path: r.path,
    name: r.name,
    content: r.content,
    encoding: r.encoding,
    lastModified: r.last_modified,
  }
}

class FileServiceImpl implements IFileService {
  /** 弹出打开对话框，用户取消返回 null */
  async openFile(): Promise<FileInfo | null> {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (!selected) return null
    return this.openFilePath(selected as string)
  }

  /** 直接按路径读取文件 */
  async openFilePath(path: string): Promise<FileInfo> {
    const raw = await invoke<RustFileInfo>('read_file', { path })
    return fromRust(raw)
  }

  /** 保存到已有路径 */
  async saveFile(path: string, content: string): Promise<void> {
    await invoke('save_file', { path, content })
  }

  /** 弹出另存为对话框，返回保存路径；用户取消返回 null */
  async saveFileAs(content: string): Promise<string | null> {
    const path = await save({
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      defaultPath: 'untitled.md',
    })
    if (!path) return null
    await this.saveFile(path, content)
    return path
  }

  /** 创建空白新文件（内存态，path = null） */
  newFile(): FileInfo {
    return {
      path: null,
      name: 'untitled.md',
      content: '',
      encoding: 'UTF-8',
      lastModified: Date.now(),
    }
  }
}

export const fileService = new FileServiceImpl()
