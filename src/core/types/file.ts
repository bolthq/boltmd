export interface FileInfo {
  path: string | null  // null = 新建未保存
  name: string
  content: string
  encoding: string
  lastModified: number
}
