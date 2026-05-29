/**
 * Simple line-based diff algorithm.
 * No external dependencies — uses LCS (Longest Common Subsequence) with
 * common prefix/suffix optimization for typical editing patterns.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
  /** Original line number (1-based) for 'same' and 'del' lines */
  oldNum?: number
  /** New line number (1-based) for 'same' and 'add' lines */
  newNum?: number
}

/**
 * Compute line-level diff between two texts.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  // Common prefix
  let prefixLen = 0
  const minLen = Math.min(oldLines.length, newLines.length)
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  // Common suffix
  let suffixLen = 0
  while (
    suffixLen < (minLen - prefixLen) &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  // Add common prefix
  for (let i = 0; i < prefixLen; i++) {
    result.push({ type: 'same', text: oldLines[i], oldNum: i + 1, newNum: i + 1 })
  }

  // Middle section — compute LCS
  const oldMiddle = oldLines.slice(prefixLen, oldLines.length - suffixLen)
  const newMiddle = newLines.slice(prefixLen, newLines.length - suffixLen)
  result.push(...lcsMiddleDiff(oldMiddle, newMiddle, prefixLen))

  // Add common suffix
  for (let i = 0; i < suffixLen; i++) {
    const oldIdx = oldLines.length - suffixLen + i
    const newIdx = newLines.length - suffixLen + i
    result.push({ type: 'same', text: oldLines[oldIdx], oldNum: oldIdx + 1, newNum: newIdx + 1 })
  }

  return result
}

/**
 * LCS-based diff for the non-common middle section.
 */
function lcsMiddleDiff(oldLines: string[], newLines: string[], offset: number): DiffLine[] {
  const m = oldLines.length
  const n = newLines.length

  // For very large diffs, fall back to simple approach to avoid O(m*n) memory.
  if (m * n > 100000) {
    return simpleDiff(oldLines, newLines, offset)
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const stack: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'same', text: oldLines[i - 1], oldNum: offset + i, newNum: offset + j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'add', text: newLines[j - 1], newNum: offset + j })
      j--
    } else {
      stack.push({ type: 'del', text: oldLines[i - 1], oldNum: offset + i })
      i--
    }
  }

  stack.reverse()
  return stack
}

/**
 * Simple fallback for very large diffs.
 */
function simpleDiff(oldLines: string[], newLines: string[], offset: number): DiffLine[] {
  const result: DiffLine[] = []
  for (let i = 0; i < oldLines.length; i++) {
    result.push({ type: 'del', text: oldLines[i], oldNum: offset + i + 1 })
  }
  for (let i = 0; i < newLines.length; i++) {
    result.push({ type: 'add', text: newLines[i], newNum: offset + i + 1 })
  }
  return result
}

/**
 * Summary statistics for a diff.
 */
export function diffStats(lines: DiffLine[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of lines) {
    if (line.type === 'add') additions++
    if (line.type === 'del') deletions++
  }
  return { additions, deletions }
}
