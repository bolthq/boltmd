/**
 * SmartPasteService
 *
 * Handles intelligent clipboard content transformation:
 * - HTML → Markdown (for source/split modes)
 * - Table data (TSV/CSV) → Markdown table
 * - URL → [title](url) with async title fetching
 * - Code detection → fenced code block
 */

import { invoke } from '@tauri-apps/api/core'
import TurndownService from 'turndown'

// Singleton TurndownService instance with sensible defaults.
let _turndown: TurndownService | null = null

function getTurndown(): TurndownService {
  if (!_turndown) {
    _turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    })

    // Keep strikethrough (del/s tags).
    _turndown.addRule('strikethrough', {
      filter: ['del', 's'] as unknown as TurndownService.Filter,
      replacement(content) {
        return `~~${content}~~`
      },
    })

    // Filter out links with empty or whitespace-only text content.
    _turndown.addRule('emptyLink', {
      filter: (node) => {
        return (
          node.nodeName === 'A' &&
          !(node.textContent ?? '').trim()
        )
      },
      replacement() {
        return ''
      },
    })

    // Links that contain images or multi-line block content (common in news
    // feeds where an <a> wraps avatar + author + timestamp). These produce
    // broken nested markdown like [![img](src)\ntext\n](url). Instead, just
    // output the inner converted content without the link wrapper.
    _turndown.addRule('complexLink', {
      filter: (node) => {
        if (node.nodeName !== 'A') return false
        // If the link contains an <img>, it's complex.
        if (node.querySelector('img')) return true
        // If the link contains block-level children, it's complex.
        const blockTags = ['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'TABLE']
        for (const tag of blockTags) {
          if (node.querySelector(tag.toLowerCase())) return true
        }
        return false
      },
      replacement(content) {
        // Return just the inner content (already converted to markdown by
        // turndown). Collapse excessive whitespace but preserve structure.
        const trimmed = content.replace(/\n{3,}/g, '\n\n').trim()
        // Ensure paragraph separation so images/content don't run together.
        return '\n\n' + trimmed + '\n\n'
      },
    })

    // Standalone images (not inside <a> or inline with text) should be
    // block-level with blank lines around them for proper rendering.
    _turndown.addRule('blockImage', {
      filter: (node) => {
        if (node.nodeName !== 'IMG') return false
        const parent = node.parentElement
        // If parent is a link, complexLink rule handles it.
        if (parent?.nodeName === 'A') return false
        // If the image is the sole or primary content of its parent block,
        // treat it as a block-level image.
        if (parent && /^(DIV|P|FIGURE|SECTION|ARTICLE|LI)$/.test(parent.nodeName)) {
          return true
        }
        return false
      },
      replacement(_content, node) {
        const el = node as HTMLElement
        const alt = el.getAttribute('alt') ?? ''
        const src = el.getAttribute('src') ?? ''
        if (!src) return ''
        return `\n\n![${alt}](${src})\n\n`
      },
    })

    // Convert table elements to Markdown tables.
    _turndown.addRule('table', {
      filter: 'table',
      replacement(_content, node) {
        return htmlTableToMarkdown(node as HTMLElement)
      },
    })

    // Remove these elements so they don't show up as noise.
    _turndown.remove(['script', 'style', 'noscript'])
  }
  return _turndown
}

/**
 * Convert an HTML <table> element to a Markdown table string.
 */
function htmlTableToMarkdown(tableEl: HTMLElement): string {
  const rows: string[][] = []
  const trElements = tableEl.querySelectorAll('tr')

  for (const tr of trElements) {
    const cells: string[] = []
    const tdElements = tr.querySelectorAll('th, td')
    for (const td of tdElements) {
      // Get text content, trim whitespace, replace newlines with spaces.
      const text = (td.textContent ?? '').trim().replace(/\n/g, ' ')
      cells.push(text)
    }
    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  if (rows.length === 0) return ''

  // Normalize column count to the maximum.
  const colCount = Math.max(...rows.map((r) => r.length))
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push('')
    return r
  })

  // Build markdown table.
  const lines: string[] = []
  // Header row.
  lines.push('| ' + normalized[0].join(' | ') + ' |')
  // Separator.
  lines.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |')
  // Data rows.
  for (let i = 1; i < normalized.length; i++) {
    lines.push('| ' + normalized[i].join(' | ') + ' |')
  }

  return '\n' + lines.join('\n') + '\n'
}

/**
 * Convert HTML string to Markdown.
 */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return ''
  const md = getTurndown().turndown(html)
  return md
}

/**
 * Detect if clipboard data contains HTML content (from web pages, Word, etc.)
 * and return the converted Markdown. Returns null if no HTML is available
 * or if the HTML is trivially equivalent to the plain text.
 */
export function tryConvertClipboardHtml(clipboardData: DataTransfer): string | null {
  const html = clipboardData.getData('text/html')
  const plainText = clipboardData.getData('text/plain')

  if (!html || !html.trim()) return null

  // Skip if the HTML is just a simple wrapper around plain text
  // (e.g. copying from a terminal or plain text editor).
  // Heuristic: if HTML contains no meaningful tags, skip conversion.
  const hasRichContent = /<(h[1-6]|p|li|ul|ol|table|tr|td|th|blockquote|pre|code|strong|em|b|i|a|img|br|hr|div|span\s)[^>]*>/i.test(html)
  if (!hasRichContent) return null

  let markdown = htmlToMarkdown(html)
  if (!markdown.trim()) return null

  // Post-processing: fix multi-line link text.
  // Markdown links must be single-line. Replace multi-line [text](url) with
  // cleaned single-line version, or remove if text is effectively empty.
  // Use [\s\S] to match across newlines within the bracket content.
  markdown = markdown.replace(/\[([\s\S]*?)\]\(([^)]*)\)/g, (_match, text: string, url: string) => {
    // Only process links whose text contains newlines (multi-line links).
    // Single-line links (including image links like ![alt](src)) are left alone.
    if (!text.includes('\n')) return _match
    // Collapse whitespace/newlines in link text to single spaces.
    const cleaned = text.replace(/\s+/g, ' ').trim()
    // If after cleanup the text is empty or just punctuation/symbols, remove the link.
    if (!cleaned || /^[!\s]*$/.test(cleaned)) return ''
    // If the inner content contains a markdown image ![...](...), unwrap: keep
    // the inner content (image + text) but drop the outer link wrapper, since
    // nested image-links render poorly and the outer URL is just noise.
    if (/!\[.*?\]\(.*?\)/.test(cleaned)) {
      return cleaned
    }
    return `[${cleaned}](${url})`
  })

  // Post-processing: handle escaped-bracket links \[...\](url).
  // Turndown escapes brackets when the link content contains nested markdown
  // (e.g. images). These render as broken text in preview. Collapse multi-line
  // ones to a proper link, or extract inner content if effectively wrapping.
  markdown = markdown.replace(/\\\[([\s\S]*?)\\\]\(([^)]*)\)/g, (_match, text: string, url: string) => {
    // Collapse whitespace/newlines to single spaces.
    const cleaned = text.replace(/\s+/g, ' ').trim()
    // If content is empty or just symbols, remove entirely.
    if (!cleaned || /^[!\s]*$/.test(cleaned)) return ''
    // If the inner content already contains a markdown image ![...](...)
    // or link [...](...), just keep the inner content without the outer wrapper.
    if (/!\[.*?\]\(.*?\)/.test(cleaned) || /\[.*?\]\(.*?\)/.test(cleaned)) {
      return cleaned
    }
    // Otherwise, form a proper link.
    return `[${cleaned}](${url})`
  })
  // Collapse excessive blank lines (3+ → 2).
  markdown = markdown.replace(/\n{3,}/g, '\n\n')
  // Trim leading/trailing whitespace.
  markdown = markdown.trim()

  if (!markdown) return null

  // If the converted markdown is essentially the same as plain text, skip.
  const normalizedMd = markdown.replace(/\s+/g, ' ').trim()
  const normalizedPlain = (plainText ?? '').replace(/\s+/g, ' ').trim()
  if (normalizedMd === normalizedPlain) return null

  return markdown
}

/**
 * Detect if pasted text is tab-separated values (TSV) and convert to Markdown table.
 * Returns null if not detected as table data.
 */
export function tryConvertTsvToTable(text: string): string | null {
  if (!text || !text.trim()) return null

  const lines = text.trim().split('\n')
  // Need at least 2 rows (header + data) and tabs present.
  if (lines.length < 2) return null

  // Check if most lines contain tabs (TSV detection).
  const linesWithTabs = lines.filter((l) => l.includes('\t'))
  if (linesWithTabs.length < lines.length * 0.8) return null

  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))

  // Normalize column count.
  const colCount = Math.max(...rows.map((r) => r.length))
  if (colCount < 2) return null // Single column is not a table.

  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push('')
    return r
  })

  // Build markdown table.
  const result: string[] = []
  result.push('| ' + normalized[0].join(' | ') + ' |')
  result.push('| ' + normalized[0].map(() => '---').join(' | ') + ' |')
  for (let i = 1; i < normalized.length; i++) {
    result.push('| ' + normalized[i].join(' | ') + ' |')
  }

  return result.join('\n')
}

// ---------------------------------------------------------------------------
// URL detection and title fetching
// ---------------------------------------------------------------------------

/** Regex to detect a standalone URL (http/https). */
const URL_REGEX = /^https?:\/\/[^\s]+$/i

/**
 * Check if the pasted text is a single URL (not an image URL — those are
 * handled separately by ImageService).
 */
export function isSingleUrl(text: string): boolean {
  const trimmed = text.trim()
  if (!URL_REGEX.test(trimmed)) return false
  // Exclude image URLs (already handled elsewhere).
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?[^\s]*)?$/i.test(trimmed)) return false
  return true
}

/**
 * Fetch the page title for a URL via the Tauri backend command.
 * Returns the title string on success, or null on failure.
 */
export async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const title = await invoke<string>('fetch_page_title', { url })
    return title || null
  } catch {
    return null
  }
}

/**
 * Build a markdown link from a URL and optional title.
 * If title is available: `[title](url)`
 * If not: bare URL.
 */
export function buildMarkdownLink(url: string, title: string | null): string {
  if (title) {
    // Escape brackets in title to avoid breaking markdown syntax.
    const safeTitle = title.replace(/\[/g, '\\[').replace(/\]/g, '\\]')
    return `[${safeTitle}](${url})`
  }
  return url
}

// ---------------------------------------------------------------------------
// Code detection and wrapping
// ---------------------------------------------------------------------------

/** Language detection result. */
interface CodeDetection {
  /** Detected language identifier (e.g. "javascript", "python") or empty string. */
  language: string
  /** Confidence score 0-1. Only wrap if above threshold. */
  confidence: number
}

/**
 * Language signature patterns. Each entry has a language name and an array of
 * regex patterns that strongly indicate that language. Patterns are tested
 * against the full pasted text.
 */
const LANG_SIGNATURES: { lang: string; patterns: RegExp[] }[] = [
  {
    lang: 'javascript',
    patterns: [
      /\b(const|let|var)\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /=>\s*[{(]/,
      /\bconsole\.(log|warn|error)\s*\(/,
      /\b(import|export)\s+.*\bfrom\s+['"]/,
      /\brequire\s*\(['"]/,
    ],
  },
  {
    lang: 'typescript',
    patterns: [
      /:\s*(string|number|boolean|any|void|never)\b/,
      /\binterface\s+\w+/,
      /\btype\s+\w+\s*=/,
      /<[A-Z]\w*>/,
      /\bas\s+(string|number|any|unknown)\b/,
    ],
  },
  {
    lang: 'python',
    patterns: [
      /\bdef\s+\w+\s*\(/,
      /\bclass\s+\w+.*:/,
      /\bimport\s+\w+/,
      /\bfrom\s+\w+\s+import\b/,
      /\bif\s+__name__\s*==\s*['"]/,
      /\bprint\s*\(/,
      /\bself\./,
    ],
  },
  {
    lang: 'rust',
    patterns: [
      /\bfn\s+\w+\s*\(/,
      /\blet\s+mut\s+/,
      /\bimpl\s+\w+/,
      /\buse\s+\w+::/,
      /\bpub\s+(fn|struct|enum|mod|trait)\b/,
      /->\s*(Self|&|[A-Z])/,
      /\bprintln!\s*\(/,
    ],
  },
  {
    lang: 'go',
    patterns: [
      /\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/,
      /\bpackage\s+\w+/,
      /\b:=\s*/,
      /\bfmt\.(Print|Sprintf|Errorf)/,
      /\bgo\s+\w+\(/,
      /\bchan\s+/,
    ],
  },
  {
    lang: 'java',
    patterns: [
      /\bpublic\s+(static\s+)?class\s+/,
      /\bSystem\.out\.print/,
      /\bprivate\s+(final\s+)?\w+\s+\w+/,
      /\b@(Override|Autowired|Component|Service)\b/,
      /\bnew\s+\w+\s*\(/,
    ],
  },
  {
    lang: 'html',
    patterns: [
      /<!DOCTYPE\s+html/i,
      /<html[\s>]/i,
      /<\/?(div|span|section|article|header|footer|main|nav)[\s>]/i,
    ],
  },
  {
    lang: 'css',
    patterns: [
      /[.#]\w[\w-]*\s*\{/,
      /\b(margin|padding|display|position|flex|grid)\s*:/,
      /@media\s*\(/,
      /@import\s+/,
    ],
  },
  {
    lang: 'sql',
    patterns: [
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/i,
      /\bFROM\s+\w+/i,
      /\bWHERE\s+/i,
      /\bJOIN\s+\w+/i,
    ],
  },
  {
    lang: 'bash',
    patterns: [
      /^#!\s*\/bin\/(bash|sh|zsh)/m,
      /\b(echo|grep|awk|sed|cat|mkdir|chmod)\s+/,
      /\$\{?\w+\}?/,
      /\|\s*(grep|awk|sed|sort|head|tail)\b/,
    ],
  },
  {
    lang: 'json',
    patterns: [
      /^\s*\{[\s\S]*"[^"]+"\s*:/,
      /^\s*\[[\s\S]*\{[\s\S]*"[^"]+"\s*:/,
    ],
  },
  {
    lang: 'yaml',
    patterns: [
      /^\w[\w-]*:\s*$/m,
      /^\s+-\s+\w/m,
      /^---\s*$/m,
    ],
  },
  {
    lang: 'cpp',
    patterns: [
      /#include\s*<[^>]+>/,
      /\bstd::/,
      /\bcout\s*<</,
      /\bvector\s*</,
      /\bnamespace\s+\w+/,
    ],
  },
  {
    lang: 'csharp',
    patterns: [
      /\busing\s+System/,
      /\bnamespace\s+\w+/,
      /\b(public|private|protected)\s+(static\s+)?(async\s+)?(void|Task|string|int|bool)\s+/,
      /\bvar\s+\w+\s*=\s*new\b/,
    ],
  },
]

/**
 * Generic code indicators that suggest the text is code regardless of language.
 */
const GENERIC_CODE_INDICATORS: RegExp[] = [
  // Braces with content on multiple lines
  /\{\s*\n/,
  // Lines ending with semicolons
  /;\s*$/m,
  // Consistent indentation (2+ spaces or tabs) on many lines
  /^(\s{2,}|\t)\S/m,
  // Function-like patterns
  /\w+\s*\([^)]*\)\s*[{:=]/,
  // Assignment operators
  /\w+\s*[+\-*/]?=\s*\S/,
  // Comments
  /^\s*(\/\/|#|\/\*|\*|--)\s*/m,
]

/**
 * Detect if pasted text looks like source code and identify the language.
 * Returns a CodeDetection with language and confidence.
 */
function detectCode(text: string): CodeDetection {
  if (!text || !text.trim()) return { language: '', confidence: 0 }

  const lines = text.split('\n')
  // Too short — unlikely to be a meaningful code snippet worth wrapping.
  if (lines.length < 3) return { language: '', confidence: 0 }

  // Check for JSON specifically (simple structural check).
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return { language: 'json', confidence: 0.95 }
    } catch { /* not valid JSON, continue */ }
  }

  // Score each language by matching patterns.
  let bestLang = ''
  let bestScore = 0

  for (const { lang, patterns } of LANG_SIGNATURES) {
    let hits = 0
    for (const p of patterns) {
      if (p.test(text)) hits++
    }
    const score = hits / patterns.length
    if (score > bestScore) {
      bestScore = score
      bestLang = lang
    }
  }

  // Also check generic code indicators to boost confidence.
  let genericHits = 0
  for (const p of GENERIC_CODE_INDICATORS) {
    if (p.test(text)) genericHits++
  }
  const genericScore = genericHits / GENERIC_CODE_INDICATORS.length

  // Combine: if we matched a specific language well, use it.
  if (bestScore >= 0.4) {
    return { language: bestLang, confidence: Math.min(bestScore + genericScore * 0.3, 1) }
  }

  // If generic indicators are strong but no specific language matched well,
  // wrap as generic code block (no language tag).
  if (genericScore >= 0.5) {
    return { language: bestLang || '', confidence: genericScore }
  }

  return { language: '', confidence: 0 }
}

/**
 * Try to detect if pasted text is code and wrap it in a fenced code block.
 * Returns the wrapped code block string, or null if not detected as code.
 *
 * Threshold: confidence must be >= 0.5 to trigger wrapping.
 */
export function tryWrapAsCodeBlock(text: string): string | null {
  if (!text || !text.trim()) return null

  const detection = detectCode(text)
  if (detection.confidence < 0.5) return null

  const fence = '```'
  const lang = detection.language
  // Ensure no trailing newline duplication.
  const code = text.endsWith('\n') ? text.slice(0, -1) : text
  return `${fence}${lang}\n${code}\n${fence}`
}
