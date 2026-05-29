/**
 * Version storage management.
 * Handles reading/writing version snapshots via the plugin FS API.
 *
 * Storage layout (within plugin data directory):
 *   history/{pathHash}/meta.json    - version metadata list
 *   history/{pathHash}/v_{ts}.md    - full content snapshot
 */

import type { PluginFileSystemAPI, PluginConfigAPI } from './types'

export interface VersionEntry {
  /** Unix timestamp (ms) */
  timestamp: number
  /** File size in characters */
  size: number
  /** First changed line as summary (truncated) */
  summary: string
}

export interface VersionMeta {
  /** Original absolute file path */
  filePath: string
  /** Version entries, newest first */
  versions: VersionEntry[]
}

/**
 * Retention policy configuration.
 */
export interface RetentionConfig {
  maxVersionsPerFile: number
  maxAgeDays: number
}

const DEFAULT_RETENTION: RetentionConfig = {
  maxVersionsPerFile: 50,
  maxAgeDays: 30,
}

/**
 * Simple hash of a string to use as directory name.
 * Uses djb2 variant — fast, non-cryptographic.
 */
export function hashPath(filePath: string): string {
  let hash = 5381
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) + hash + filePath.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export class VersionStorage {
  private fs: PluginFileSystemAPI
  private config: PluginConfigAPI

  constructor(fs: PluginFileSystemAPI, config: PluginConfigAPI) {
    this.fs = fs
    this.config = config
  }

  private dirFor(pathHash: string): string {
    return `history/${pathHash}`
  }

  private metaPath(pathHash: string): string {
    return `${this.dirFor(pathHash)}/meta.json`
  }

  private versionPath(pathHash: string, timestamp: number): string {
    return `${this.dirFor(pathHash)}/v_${timestamp}.md`
  }

  /**
   * Load version metadata for a file.
   */
  async loadMeta(filePath: string): Promise<VersionMeta> {
    const hash = hashPath(filePath)
    const metaFile = this.metaPath(hash)

    if (await this.fs.exists(metaFile)) {
      const raw = await this.fs.readFile(metaFile)
      return JSON.parse(raw) as VersionMeta
    }

    return { filePath, versions: [] }
  }

  /**
   * Save a new version snapshot. Returns true if saved, false if content unchanged.
   */
  async saveVersion(filePath: string, content: string, lastContent: string | null): Promise<boolean> {
    if (lastContent !== null && content === lastContent) {
      return false
    }

    const hash = hashPath(filePath)
    const meta = await this.loadMeta(filePath)
    const timestamp = Date.now()

    const summary = this.generateSummary(content, lastContent)

    // Save full snapshot
    await this.fs.writeFile(this.versionPath(hash, timestamp), content)

    // Update metadata
    meta.filePath = filePath
    meta.versions.unshift({
      timestamp,
      size: content.length,
      summary,
    })

    // Apply retention policy before writing meta.
    await this.applyRetention(meta, hash)

    await this.fs.writeFile(this.metaPath(hash), JSON.stringify(meta, null, 2))
    return true
  }

  /**
   * Load version content by timestamp.
   */
  async loadVersion(filePath: string, timestamp: number): Promise<string> {
    const hash = hashPath(filePath)
    return await this.fs.readFile(this.versionPath(hash, timestamp))
  }

  /**
   * Delete a specific version.
   */
  async deleteVersion(filePath: string, timestamp: number): Promise<void> {
    const hash = hashPath(filePath)
    const meta = await this.loadMeta(filePath)

    meta.versions = meta.versions.filter(v => v.timestamp !== timestamp)
    await this.fs.writeFile(this.metaPath(hash), JSON.stringify(meta, null, 2))

    try {
      await this.fs.deleteFile(this.versionPath(hash, timestamp))
    } catch {
      // File may already be deleted
    }
  }

  /**
   * Generate a short summary of what changed.
   */
  private generateSummary(content: string, lastContent: string | null): string {
    if (lastContent === null) {
      const firstLine = content.split('\n')[0] || ''
      return firstLine.slice(0, 60)
    }

    const newLines = content.split('\n')
    const oldLines = lastContent.split('\n')
    const maxLen = Math.max(newLines.length, oldLines.length)

    for (let i = 0; i < maxLen; i++) {
      if (newLines[i] !== oldLines[i]) {
        const line = newLines[i] ?? oldLines[i] ?? ''
        return line.trim().slice(0, 60) || `(line ${i + 1} changed)`
      }
    }

    return '(minor change)'
  }

  /**
   * Get retention config from plugin settings (or defaults).
   */
  async getRetention(): Promise<RetentionConfig> {
    const saved = await this.config.get<RetentionConfig>('retention')
    return saved ?? DEFAULT_RETENTION
  }

  /**
   * Apply retention policy: remove versions exceeding max count or max age.
   */
  private async applyRetention(meta: VersionMeta, pathHash: string): Promise<void> {
    const retention = await this.getRetention()
    const now = Date.now()
    const maxAge = retention.maxAgeDays * 24 * 60 * 60 * 1000

    // Remove versions older than maxAge
    const expired = meta.versions.filter(v => (now - v.timestamp) > maxAge)
    for (const v of expired) {
      try { await this.fs.deleteFile(this.versionPath(pathHash, v.timestamp)) } catch { /* ignore */ }
    }
    meta.versions = meta.versions.filter(v => (now - v.timestamp) <= maxAge)

    // Trim to max count (keep newest)
    while (meta.versions.length > retention.maxVersionsPerFile) {
      const removed = meta.versions.pop()!
      try { await this.fs.deleteFile(this.versionPath(pathHash, removed.timestamp)) } catch { /* ignore */ }
    }
  }
}
