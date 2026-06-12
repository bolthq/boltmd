/**
 * WebDAV client — Unit 1: connection test + directory listing.
 */

import type { PluginNetworkAPI, HttpResponse } from './types'
import { parseMultistatus, type DavResource } from './xml-parser'

export interface WebDAVConfig {
  /** Server base URL, e.g. "https://dav.example.com" */
  serverUrl: string
  /** Remote directory path, e.g. "/boltmd/" */
  remoteDir: string
  /** Username (Basic Auth) or token (Bearer) */
  username: string
  /** Password (Basic Auth) */
  password: string
  /** Authentication method */
  authMethod: 'basic' | 'bearer'
  /** Request timeout in ms */
  timeout: number
  /** Automatically upload on file save */
  autoSyncOnSave: boolean
  /** Auto-upload unsaved drafts every N seconds (0 = disabled) */
  draftSyncIntervalSec: number
}

export class WebDAVClient {
  private network: PluginNetworkAPI
  private config: WebDAVConfig

  constructor(network: PluginNetworkAPI, config: WebDAVConfig) {
    this.network = network
    this.config = config
  }

  updateConfig(config: WebDAVConfig): void {
    this.config = config
  }

  /**
   * Test connection: PROPFIND Depth:0 on remoteDir.
   * Returns { ok: true } if server responds 207, else { ok: false, error }.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const resp = await this.propfind(this.config.remoteDir, 0)
      if (resp.status === 207) return { ok: true }
      if (resp.status === 401 || resp.status === 403) {
        return { ok: false, error: `Authentication failed (${resp.status})` }
      }
      if (resp.status === 404) {
        return { ok: false, error: `Remote directory not found: ${this.config.remoteDir}` }
      }
      return { ok: false, error: `Unexpected status: ${resp.status}` }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  /**
   * List files in a remote directory (PROPFIND Depth:1).
   * Returns entries excluding the directory itself.
   */
  async listDirectory(remotePath: string): Promise<DavResource[]> {
    const resp = await this.propfind(remotePath, 1)
    if (resp.status !== 207) {
      throw new Error(`PROPFIND failed with status ${resp.status}`)
    }
    const resources = parseMultistatus(resp.body)

    // Filter out the directory entry itself (usually the first result).
    const dirPath = this.normalizePath(remotePath)
    return resources.filter(r => this.normalizePath(r.href) !== dirPath)
  }

  /**
   * Upload a file to the server via PUT.
   * Returns the ETag from the response (if provided by server).
   */
  async putFile(remotePath: string, content: string): Promise<{ etag: string | null }> {
    const url = this.buildUrl(remotePath)
    const resp = await this.network.request({
      url,
      method: 'PUT',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: content,
      timeout: this.config.timeout,
    })
    if (resp.status >= 200 && resp.status < 300) {
      const etag = resp.headers['etag'] || resp.headers['ETag'] || null
      return { etag }
    }
    throw new Error(`PUT failed: ${resp.status}`)
  }

  /**
   * Ensure a remote directory exists (MKCOL).
   * Ignores 405 (already exists) and 301 (redirect to existing).
   */
  async ensureDirectory(remotePath: string): Promise<void> {
    const url = this.buildUrl(remotePath)
    const resp = await this.network.request({
      url,
      method: 'MKCOL',
      headers: this.authHeaders(),
      timeout: this.config.timeout,
    })
    // 201 = created, 405 = already exists, both are fine.
    if (resp.status === 201 || resp.status === 405 || resp.status === 301) return
    if (resp.status >= 400) {
      throw new Error(`MKCOL ${remotePath} failed: ${resp.status}`)
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async propfind(remotePath: string, depth: 0 | 1): Promise<HttpResponse> {
    const url = this.buildUrl(remotePath)
    const body = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<d:propfind xmlns:d="DAV:">',
      '  <d:prop>',
      '    <d:resourcetype/>',
      '    <d:getetag/>',
      '    <d:getlastmodified/>',
      '    <d:getcontentlength/>',
      '  </d:prop>',
      '</d:propfind>',
    ].join('\n')

    return this.network.request({
      url,
      method: 'PROPFIND',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/xml; charset=utf-8',
        'Depth': String(depth),
      },
      body,
      timeout: this.config.timeout,
    })
  }

  private buildUrl(remotePath: string): string {
    const base = this.config.serverUrl.replace(/\/$/, '')
    const path = remotePath.startsWith('/') ? remotePath : '/' + remotePath
    return base + encodeURI(path)
  }

  private authHeaders(): Record<string, string> {
    if (this.config.authMethod === 'bearer') {
      return { 'Authorization': `Bearer ${this.config.password}` }
    }
    const encoded = btoa(`${this.config.username}:${this.config.password}`)
    return { 'Authorization': `Basic ${encoded}` }
  }

  /** Strip trailing slash and server prefix for path comparison. */
  private normalizePath(path: string): string {
    const base = this.config.serverUrl.replace(/\/$/, '')
    let p = path.startsWith(base) ? path.slice(base.length) : path
    try { p = decodeURIComponent(p) } catch { /* already decoded */ }
    return p.replace(/\/$/, '')
  }
}
