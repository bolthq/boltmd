/**
 * BundledDocs — runtime loader for Markdown files shipped under `public/`.
 *
 * Vite copies everything in `public/` verbatim to the build output, and
 * Tauri serves that directory under its custom protocol in production.
 * Fetching by root-relative path therefore works in both dev and packaged
 * builds without needing `import.meta.url` gymnastics.
 *
 * Each bundled doc is registered here with:
 *   - the path used for `fetch()`
 *   - the tab title shown to the user (kept in English on purpose — tab
 *     titles read like filenames, and these files ship as .md assets)
 */

export type BundledDocName = 'welcome' | 'markdown-guide'

interface BundledDocMeta {
  /** Root-relative URL the browser/webview can fetch. */
  url: string
  /** Filename-style title shown in the tab strip. */
  title: string
}

const REGISTRY: Record<BundledDocName, BundledDocMeta> = {
  'welcome': {
    url: '/welcome.md',
    title: 'Welcome.md',
  },
  'markdown-guide': {
    url: '/markdown-guide.md',
    title: 'Markdown Guide.md',
  },
}

export interface BundledDoc {
  title: string
  content: string
}

/**
 * Load a bundled Markdown document. Resolves to { title, content } ready to
 * hand over to TabManager.openBundledDocTab.
 *
 * Throws when the HTTP fetch fails or returns a non-2xx status — callers
 * should surface this to the user (typically via a toast) rather than
 * silently opening an empty tab.
 */
export async function loadBundledDoc(name: BundledDocName): Promise<BundledDoc> {
  const meta = REGISTRY[name]
  const res = await fetch(meta.url)
  if (!res.ok) {
    throw new Error(`Failed to load bundled doc "${name}": HTTP ${res.status}`)
  }
  const content = await res.text()
  return { title: meta.title, content }
}
