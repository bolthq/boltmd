/**
 * regen-icons — rebuild the master icon at 1024x1024 with safe padding,
 * then regenerate all platform-specific icon assets via `tauri icon`.
 *
 * Why this exists:
 *   The original src-tauri/icons/icon.png was 512x512 with only ~2%
 *   transparent padding. When Tauri's icon pipeline downsampled it to
 *   16/32/48 px the rounded-square artwork touched the canvas edge,
 *   which surfaced as a 1px white fringe in the Windows task switcher
 *   and as aliased edges at small sizes.
 *
 * What this script does:
 *   1. Reads the current master PNG (assumed to contain the artwork)
 *   2. Trims any existing transparent border so we start from the
 *      tight artwork bounds
 *   3. Composites the trimmed artwork onto a fresh 1024x1024 canvas,
 *      centered, at ~80% scale (so ~10% padding on every side)
 *   4. Writes the result back to src-tauri/icons/icon.png and also
 *      copies it to public/logo.png (used by the About dialog)
 *   5. Invokes `pnpm tauri icon` to regenerate every derived asset
 *      (icon.ico, icon.icns, Square*Logo.png, 32x32.png, ...)
 *
 * Run:
 *   pnpm icons
 */

import { spawnSync } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const masterPath = resolve(repoRoot, 'src-tauri/icons/icon.png')
const publicLogoPath = resolve(repoRoot, 'public/logo.png')

const CANVAS = 1024
// Inner box ratio. 0.80 leaves 10% padding on each side, which keeps
// the artwork clear of any task-switcher container outline at 16/32/48.
const INNER_RATIO = 0.80

async function rebuildMaster() {
  // Trim to tight artwork bounds so downstream scaling is independent
  // of whatever padding was baked into the current master.
  const trimmed = await sharp(masterPath)
    .trim({ threshold: 1 })
    .toBuffer()

  const trimmedMeta = await sharp(trimmed).metadata()
  const srcW = trimmedMeta.width ?? 1
  const srcH = trimmedMeta.height ?? 1
  const srcMax = Math.max(srcW, srcH)

  const innerSize = Math.round(CANVAS * INNER_RATIO)
  const scale = innerSize / srcMax
  const scaledW = Math.round(srcW * scale)
  const scaledH = Math.round(srcH * scale)

  const scaled = await sharp(trimmed)
    .resize(scaledW, scaledH, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png()
    .toBuffer()

  const canvas = sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: scaled,
        left: Math.round((CANVAS - scaledW) / 2),
        top: Math.round((CANVAS - scaledH) / 2),
      },
    ])
    .png({ compressionLevel: 9 })

  await canvas.toFile(masterPath)
  await copyFile(masterPath, publicLogoPath)

  console.log(`[icons] Rebuilt master ${CANVAS}x${CANVAS} with ${Math.round((1 - INNER_RATIO) * 100 / 2)}% padding`)
  console.log(`[icons]   artwork source: ${srcW}x${srcH} (trimmed)`)
  console.log(`[icons]   inner box:      ${scaledW}x${scaledH}`)
  console.log(`[icons]   wrote:          ${masterPath}`)
  console.log(`[icons]   wrote:          ${publicLogoPath}`)
}

function runTauriIcon() {
  console.log('[icons] Running `pnpm tauri icon` ...')
  const result = spawnSync(
    'pnpm',
    ['tauri', 'icon', 'src-tauri/icons/icon.png'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  )
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

await rebuildMaster()
runTauriIcon()
console.log('[icons] Done.')
