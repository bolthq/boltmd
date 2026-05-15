import { Editor } from '@tiptap/core'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { createWysiwygExtensions } from '../editor/WysiwygEditor'
import { themeService } from './ThemeService'
import { configService } from './ConfigService'
import { t } from '../../i18n'

// Export theme: resolved to light or dark before generating HTML.
export type ExportTheme = 'light' | 'dark' | 'current'

// ── Theme CSS Variables (inlined into exported HTML) ─────────────────────────

const LIGHT_VARS: Record<string, string> = {
  '--bg-primary': '#ffffff',
  '--bg-secondary': '#f5f5f5',
  '--bg-editor': '#ffffff',
  '--bg-tertiary': '#f3f4f6',
  '--bg-hover': '#f0f0f0',
  '--bg-active': '#e8e8e8',
  '--text-primary': '#1a1a1a',
  '--text-secondary': '#4a4a4a',
  '--text-muted': '#8a8a8a',
  '--text-placeholder': '#b0b0b0',
  '--border-color': '#e0e0e0',
  '--border-primary': '#e0e0e0',
  '--border-active': '#bdbdbd',
  '--accent-color': '#6366f1',
  '--accent-primary': '#6366f1',
  '--accent-hover': '#4f46e5',
  '--code-bg': '#f3f4f6',
  '--code-text': '#1f2937',
  '--heading-color': '#111827',
  '--link-color': '#6366f1',
  '--selection-bg': '#e0e7ff',
}

const DARK_VARS: Record<string, string> = {
  '--bg-primary': '#1e1e1e',
  '--bg-secondary': '#252525',
  '--bg-editor': '#1e1e1e',
  '--bg-tertiary': '#2d2d2d',
  '--bg-hover': '#2a2a2a',
  '--bg-active': '#333333',
  '--text-primary': '#e8e8e8',
  '--text-secondary': '#b0b0b0',
  '--text-muted': '#6b6b6b',
  '--text-placeholder': '#555555',
  '--border-color': '#3a3a3a',
  '--border-primary': '#3a3a3a',
  '--border-active': '#555555',
  '--accent-color': '#818cf8',
  '--accent-primary': '#818cf8',
  '--accent-hover': '#a5b4fc',
  '--code-bg': '#2d2d2d',
  '--code-text': '#e2e8f0',
  '--heading-color': '#f3f4f6',
  '--link-color': '#a5b4fc',
  '--selection-bg': '#3730a3',
}

function resolveThemeVars(theme: ExportTheme): Record<string, string> {
  if (theme === 'current') {
    const resolved = themeService.getResolvedTheme()
    return resolved === 'dark' ? DARK_VARS : LIGHT_VARS
  }
  return theme === 'dark' ? DARK_VARS : LIGHT_VARS
}

// ── Markdown → HTML via headless Tiptap ──────────────────────────────────────

/**
 * Convert markdown text to an HTML fragment string using a headless Tiptap
 * instance with the same extensions as the WYSIWYG editor.
 */
function markdownToHtml(markdown: string): string {
  // Create a headless Tiptap editor (no DOM parent).
  const editor = new Editor({
    extensions: createWysiwygExtensions(),
    content: markdown,
    // The tiptap-markdown extension will parse the markdown content string
    // into ProseMirror nodes during creation.
  })

  const html = editor.getHTML()
  editor.destroy()
  return html
}

// ── Inline CSS (subset of editor.css adapted for export) ─────────────────────

function buildInlineCSS(vars: Record<string, string>): string {
  const varBlock = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  const fontSize = configService.get('fontSize')
  const fontFamily = configService.get('fontFamily')
  const lineHeight = configService.get('lineHeight')

  return `
:root {
${varBlock}
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: ${fontFamily};
  font-size: ${fontSize}px;
  line-height: ${lineHeight};
  padding: 40px;
}

.export-content {
  max-width: 800px;
  margin: 0 auto;
}

h1, h2, h3, h4, h5, h6 {
  color: var(--heading-color);
  font-weight: 600;
  line-height: 1.3;
  margin: 1.25em 0 0.5em 0;
}

h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }

p {
  margin: 0 0 0.75em 0;
}

strong { font-weight: 600; }
em { font-style: italic; }
s { text-decoration: line-through; }

code {
  background: var(--code-bg);
  color: var(--accent-primary);
  border-radius: 3px;
  padding: 0.1em 0.3em;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

pre {
  background: var(--code-bg);
  border-radius: 6px;
  padding: 1em;
  margin: 0.75em 0;
  overflow-x: auto;
}

pre code {
  background: none;
  padding: 0;
  color: var(--text-primary);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
  display: block;
  white-space: pre;
}

blockquote {
  border-left: 3px solid var(--accent-primary);
  margin: 0.75em 0;
  padding-left: 1em;
  color: var(--text-secondary);
}

ul, ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

li {
  margin: 0.25em 0;
}

hr {
  border: none;
  border-top: 1px solid var(--border-primary);
  margin: 1.5em 0;
}

a {
  color: var(--link-color);
  text-decoration: underline;
  text-underline-offset: 2px;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  table-layout: fixed;
}

th, td {
  border: 1px solid var(--border-primary);
  padding: 0.5em 0.75em;
  text-align: left;
  vertical-align: top;
}

th {
  background: var(--bg-tertiary);
  font-weight: 600;
}

tr:nth-child(even) td {
  background: var(--bg-hover);
}

img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

mark {
  background: #fef08a;
  border-radius: 2px;
  padding: 0.05em 0.1em;
}

/* Task list */
ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
}

ul[data-type="taskList"] li label {
  flex-shrink: 0;
  margin-top: 0.15em;
}

ul[data-type="taskList"] li[data-checked="true"] p {
  text-decoration: line-through;
  color: var(--text-muted);
}

/* Code block syntax highlighting */
pre .hljs-comment, pre .hljs-quote { color: var(--text-muted); font-style: italic; }
pre .hljs-keyword, pre .hljs-selector-tag, pre .hljs-built_in { color: #c678dd; }
pre .hljs-string, pre .hljs-attr { color: #98c379; }
pre .hljs-number, pre .hljs-literal { color: #d19a66; }
pre .hljs-title, pre .hljs-section, pre .hljs-name { color: #61afef; }
pre .hljs-variable, pre .hljs-params { color: #e06c75; }
pre .hljs-type, pre .hljs-class .hljs-title { color: #e5c07b; }
pre .hljs-meta { color: var(--text-muted); }

@media print {
  body {
    background: white;
    color: #1a1a1a;
    padding: 0;
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  a { color: #6366f1; }
}
`
}

// ── Full HTML document ───────────────────────────────────────────────────────

function buildFullHtml(bodyHtml: string, title: string, theme: ExportTheme): string {
  const vars = resolveThemeVars(theme)
  const css = buildInlineCSS(vars)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
<div class="export-content">
${bodyHtml}
</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Export the current document as a standalone HTML file.
 * Shows a save dialog, writes the file.
 * Returns the saved path, or null if cancelled.
 */
export async function exportHtml(
  markdown: string,
  fileName: string,
): Promise<string | null> {
  const theme: ExportTheme = 'current'
  const bodyHtml = markdownToHtml(markdown)
  const title = fileName.replace(/\.md$/i, '')
  const fullHtml = buildFullHtml(bodyHtml, title, theme)

  const defaultName = title + '.html'
  const path = await save({
    filters: [
      { name: 'HTML', extensions: ['html', 'htm'] },
      { name: t('fileDialog.allFiles'), extensions: ['*'] },
    ],
    defaultPath: defaultName,
  })
  if (!path) return null

  await invoke('save_file', { path, content: fullHtml })
  return path
}

/**
 * Export the current document as PDF via the system print dialog.
 * Renders the styled HTML in a hidden iframe and calls window.print().
 */
export function exportPdf(markdown: string, fileName: string): void {
  const theme: ExportTheme = 'current'
  const bodyHtml = markdownToHtml(markdown)
  const title = fileName.replace(/\.md$/i, '')
  const fullHtml = buildFullHtml(bodyHtml, title, theme)

  // Create a hidden iframe for printing.
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '-9999px'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (!iframeDoc) {
    document.body.removeChild(iframe)
    return
  }

  iframeDoc.open()
  iframeDoc.write(fullHtml)
  iframeDoc.close()

  // Wait for content to render, then trigger print.
  // Temporarily set the parent window title to the document name so the
  // print header shows the file name instead of "BoltMD".
  setTimeout(() => {
    const prevTitle = document.title
    document.title = title
    iframe.contentWindow?.print()
    // Restore original title and clean up after the print dialog closes.
    setTimeout(() => {
      document.title = prevTitle
      document.body.removeChild(iframe)
    }, 1000)
  }, 300)
}
