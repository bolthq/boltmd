import type { FileInfo } from '../types/file'

export interface IFileService {
  openFile(): Promise<FileInfo | null>
  openFilePath(path: string): Promise<FileInfo>
  saveFile(path: string, content: string): Promise<void>
  saveFileAs(content: string): Promise<string | null>
  newFile(): FileInfo
}
