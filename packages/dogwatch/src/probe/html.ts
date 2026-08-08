/**
 * Minimal HTML link/favicon extraction for the `link`/`brand` families.
 * Regex-based on purpose: dogwatch only ever reads pages it operates
 * (SPEC §1 non-goal 1), so it does not need a hardened HTML parser for
 * hostile input — a full DOM parser dependency would be scope creep for a
 * sharp tool. Pure functions, zero I/O.
 */

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*)["']/gi;
const ICON_LINK_RE = /<link\b[^>]*\brel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/gi;
const HREF_ATTR_RE = /\bhref\s*=\s*["']([^"']+)["']/i;

export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1];
    if (href !== undefined) out.push(href);
  }
  return out;
}

/**
 * `pageUrl` is required and must be the crawled page's OWN URL, not the
 * backlink target's — a relative href (`/about`) must resolve against the
 * page that contains it, otherwise every site-relative link would trivially
 * "resolve to" whatever host happens to be passed as `host` and the check
 * could never honestly fail (caught by probe/html.test.ts: an internal
 * `/about` link on a page with no real backlink was misreported as one).
 */
export function containsBacklink(html: string, host: string, pageUrl: string): boolean {
  return extractHrefs(html).some((href) => {
    try {
      return new URL(href, pageUrl).host === host;
    } catch {
      return false;
    }
  });
}

/** First `<link rel="…icon…">` href, or `/favicon.ico` when the page
 * declares none (the HTTP default browsers themselves fall back to). */
export function findFaviconHref(html: string): string {
  for (const tag of html.matchAll(ICON_LINK_RE)) {
    const hrefMatch = HREF_ATTR_RE.exec(tag[0]);
    if (hrefMatch?.[1] !== undefined) return hrefMatch[1];
  }
  return "/favicon.ico";
}

export function resolveLinks(baseUrl: string, hrefs: readonly string[]): string[] {
  const out: string[] = [];
  for (const href of hrefs) {
    try {
      out.push(new URL(href, baseUrl).toString());
    } catch {
      // Not a resolvable URL (mailto:, javascript:, malformed) — skip.
    }
  }
  return out;
}
