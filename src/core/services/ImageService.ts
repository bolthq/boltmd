import { invoke } from '@tauri-apps/api/core'
import { errorService, ErrorLevel } from './ErrorService'
import { t } from '../../i18n'

export interface IImageService {
  handlePasteImage(blob: Blob, currentFilePath: string | null): Promise<string | null>
  handleDropImage(file: File, currentFilePath: string | null): Promise<string | null>
}

/** Blob → base64 字符串（纯数据，不含 data:xxx;base64, 前缀） */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** 生成图片文件名：boltmd-{timestamp}.png */
function generateFilename(ext: string = 'png'): string {
  return `boltmd-${Date.now()}.${ext}`
}

/** 从文件路径推导 assets 目录（同级 ./assets/） */
function getAssetsDir(filePath: string | null): string | null {
  if (!filePath) return null
  const sep = filePath.includes('\\') ? '\\' : '/'
  const dir = filePath.substring(0, filePath.lastIndexOf(sep))
  return dir + sep + 'assets'
}

class ImageServiceImpl implements IImageService {
  /** 处理粘贴的图片 Blob */
  async handlePasteImage(blob: Blob, currentFilePath: string | null): Promise<string | null> {
    const assetsDir = getAssetsDir(currentFilePath)
    if (!assetsDir) {
      errorService.report({
        level: ErrorLevel.Warning,
        message: t('errors.saveImageFirst'),
        source: 'ImageService',
      })
      return null
    }

    try {
      const base64 = await blobToBase64(blob)
      const filename = generateFilename('png')
      await invoke('save_image', { dir: assetsDir, filename, data: base64 })
      return `./assets/${filename}`
    } catch (e) {
      errorService.report({
        level: ErrorLevel.Error,
        message: t('errors.saveImageFailed'),
        detail: String(e),
        source: 'ImageService',
      })
      return null
    }
  }

  /** 处理拖拽的图片文件 */
  async handleDropImage(file: File, currentFilePath: string | null): Promise<string | null> {
    const assetsDir = getAssetsDir(currentFilePath)
    if (!assetsDir) {
      errorService.report({
        level: ErrorLevel.Warning,
        message: t('errors.dropImageFirst'),
        source: 'ImageService',
      })
      return null
    }

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const base64 = await blobToBase64(file)
      const filename = generateFilename(ext)
      await invoke('save_image', { dir: assetsDir, filename, data: base64 })
      return `./assets/${filename}`
    } catch (e) {
      errorService.report({
        level: ErrorLevel.Error,
        message: t('errors.dropImageFailed'),
        detail: String(e),
        source: 'ImageService',
      })
      return null
    }
  }
}

export const imageService = new ImageServiceImpl()

/** 常见图片扩展名 */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i

/** 判断文本是否为图片 URL */
export function isImageUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const url = new URL(trimmed)
    return IMAGE_EXTS.test(url.pathname)
  } catch {
    return false
  }
}
