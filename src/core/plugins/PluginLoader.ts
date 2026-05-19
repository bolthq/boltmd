// PluginLoader: scan plugins directory via Rust, parse and validate manifests.

import { invoke } from '@tauri-apps/api/core'
import type { PluginManifest } from './types'

// Must match the Rust ScannedPlugin struct.
interface RawScannedPlugin {
  name: string
  path: string
  manifest: string
}

/** A successfully loaded plugin (manifest validated). */
export interface LoadedPlugin {
  manifest: PluginManifest
  dirPath: string
}

/** A plugin that failed validation. */
export interface PluginValidationError {
  dirName: string
  dirPath: string
  reason: string
}

/** Result of scanning the plugins directory. */
export interface ScanResult {
  plugins: LoadedPlugin[]
  errors: PluginValidationError[]
}

const PLUGIN_API_VERSION = 1

/** Allowed permission values — reject anything not in this set. */
const VALID_PERMISSIONS: ReadonlySet<string> = new Set([
  'editor', 'editor.readonly', 'commands', 'statusbar', 'sidebar',
  'config', 'events', 'fs:read', 'fs:write', 'network',
])

/** Scan the plugins directory and validate all found manifests. */
export async function scanPlugins(): Promise<ScanResult> {
  const raw = await invoke<RawScannedPlugin[]>('scan_plugins_dir')

  const plugins: LoadedPlugin[] = []
  const errors: PluginValidationError[] = []

  for (const entry of raw) {
    const result = validateManifest(entry.name, entry.manifest)
    if (result.ok) {
      plugins.push({ manifest: result.manifest, dirPath: entry.path })
    } else {
      errors.push({ dirName: entry.name, dirPath: entry.path, reason: result.reason })
    }
  }

  return { plugins, errors }
}

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

type ValidateResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; reason: string }

function validateManifest(dirName: string, rawJson: string): ValidateResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return { ok: false, reason: 'Invalid JSON in manifest.json' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'manifest.json must be a JSON object' }
  }

  const obj = parsed as Record<string, unknown>

  // Required string fields.
  const requiredStrings = ['id', 'name', 'version', 'author', 'description'] as const
  for (const field of requiredStrings) {
    if (typeof obj[field] !== 'string' || (obj[field] as string).trim() === '') {
      return { ok: false, reason: `Missing or invalid field: "${field}"` }
    }
  }

  // id must match directory name.
  if (obj.id !== dirName) {
    return { ok: false, reason: `Manifest "id" ("${obj.id}") does not match directory name ("${dirName}")` }
  }

  // main: optional, default "index.js". Must not escape plugin directory.
  const main = typeof obj.main === 'string' && obj.main.trim() !== '' ? obj.main as string : 'index.js'
  // Security: reject path traversal attempts in the main field.
  const normalizedMain = main.replace(/\\/g, '/')
  if (
    normalizedMain.startsWith('/') ||
    normalizedMain.startsWith('..') ||
    normalizedMain.includes('/../') ||
    normalizedMain.includes('/..') ||
    normalizedMain.includes(':')
  ) {
    return { ok: false, reason: `Invalid "main" path: "${main}" — must be a relative path within the plugin directory` }
  }

  // minAppVersion: required string.
  if (typeof obj.minAppVersion !== 'string' || obj.minAppVersion.trim() === '') {
    return { ok: false, reason: 'Missing or invalid field: "minAppVersion"' }
  }

  // apiVersion: required number.
  if (typeof obj.apiVersion !== 'number' || !Number.isInteger(obj.apiVersion)) {
    return { ok: false, reason: 'Missing or invalid field: "apiVersion" (must be integer)' }
  }
  if (obj.apiVersion > PLUGIN_API_VERSION) {
    return { ok: false, reason: `Plugin requires apiVersion ${obj.apiVersion}, but app supports up to ${PLUGIN_API_VERSION}` }
  }

  // permissions: required array of strings from the allowed set.
  if (!Array.isArray(obj.permissions)) {
    return { ok: false, reason: 'Missing or invalid field: "permissions" (must be array)' }
  }
  for (const perm of obj.permissions) {
    if (typeof perm !== 'string') {
      return { ok: false, reason: `Invalid permission value: ${JSON.stringify(perm)}` }
    }
    if (!VALID_PERMISSIONS.has(perm)) {
      return { ok: false, reason: `Unknown permission: "${perm}". Allowed: ${[...VALID_PERMISSIONS].join(', ')}` }
    }
  }

  const manifest: PluginManifest = {
    id: obj.id as string,
    name: obj.name as string,
    version: obj.version as string,
    author: obj.author as string,
    description: obj.description as string,
    main,
    minAppVersion: obj.minAppVersion as string,
    apiVersion: obj.apiVersion as number,
    permissions: obj.permissions as PluginManifest['permissions'],
  }

  return { ok: true, manifest }
}
