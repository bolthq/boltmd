/**
 * Parse WebDAV PROPFIND multistatus XML responses.
 * Uses DOMParser available in the WebView environment.
 */

export interface DavResource {
  /** URL-decoded href path from the response. */
  href: string
  /** Whether this is a collection (directory). */
  isCollection: boolean
  /** ETag value (quotes stripped), or null. */
  etag: string | null
  /** Last modified date string, or null. */
  lastModified: string | null
  /** Content length in bytes, or null. */
  contentLength: number | null
}

/**
 * Parse a WebDAV multistatus XML body into resource entries.
 */
export function parseMultistatus(xml: string): DavResource[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`)
  }

  const results: DavResource[] = []
  const responses = doc.querySelectorAll('*|response')

  for (const response of responses) {
    const href = getText(response, 'href')
    if (!href) continue

    const propstat = findOkPropstat(response)
    if (!propstat) continue

    const resourceType = propstat.querySelector('*|resourcetype')
    const isCollection = resourceType
      ? resourceType.querySelector('*|collection') !== null
      : false

    const etag = getText(propstat, 'getetag')
    const lastModified = getText(propstat, 'getlastmodified')
    const contentLengthStr = getText(propstat, 'getcontentlength')

    results.push({
      href: decodeURIComponent(href),
      isCollection,
      etag: etag ? etag.replace(/"/g, '') : null,
      lastModified,
      contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : null,
    })
  }

  return results
}

/** Find the <propstat> with a 200 status. */
function findOkPropstat(response: Element): Element | null {
  const propstats = response.querySelectorAll('*|propstat')
  for (const ps of propstats) {
    const status = getText(ps, 'status')
    if (status && status.includes('200')) return ps
  }
  // Fallback: single propstat without explicit status check.
  if (propstats.length === 1) return propstats[0]
  return null
}

/** Get trimmed text content of a child element by local name. */
function getText(parent: Element, localName: string): string | null {
  const el = parent.querySelector(`*|${localName}`)
  return el?.textContent?.trim() || null
}
