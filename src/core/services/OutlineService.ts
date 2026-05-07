/**
 * OutlineService — extract heading structure from Markdown content.
 *
 * Parses ATX-style headings (# to ######) and returns a flat list of
 * heading entries with level, text, and line number.
 */

export interface HeadingItem {
  /** Heading level 1-6 */
  level: number
  /** Heading text (without leading # and whitespace) */
  text: string
  /** 0-based line number in the source */
  line: number
}

/**
 * Parse Markdown content and extract all ATX headings.
 *
 * Rules:
 * - Only ATX headings (lines starting with 1-6 `#` followed by a space)
 * - Ignores headings inside fenced code blocks (``` or ~~~)
 * - Strips trailing `#` decorations (e.g. `## Foo ##` → "Foo")
 */
export function parseHeadings(markdown: string): HeadingItem[] {
  const lines = markdown.split('\n')
  const headings: HeadingItem[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect fenced code block boundaries.
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) continue

    // Match ATX heading: 1-6 # at start, followed by space.
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      // Strip trailing # decorations and trim.
      const text = match[2].replace(/\s+#+\s*$/, '').trim()
      if (text) {
        headings.push({ level, text, line: i })
      }
    }
  }

  return headings
}
