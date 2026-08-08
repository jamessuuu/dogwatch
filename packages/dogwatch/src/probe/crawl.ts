/**
 * Bounded same-origin crawl (SPEC §2 `link`/`brand`): ≤30 pages/site,
 * external links collected (HEAD-checked by the caller — this module only
 * discovers them). No 7-day external-link result cache yet — every run
 * re-checks fresh (documented simplification; the cache is additive and
 * slots in later without changing this module's shape).
 */
import { extractHrefs, resolveLinks } from "./html.js";
import type { HttpProbe } from "./types.js";

export const DEFAULT_MAX_PAGES = 30;
export const DEFAULT_MAX_EXTERNAL_LINKS = 60;

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  bodyText: string;
}

export interface CrawlResult {
  origin: string;
  pages: CrawledPage[];
  /** Deduped, capped at maxExternalLinks. */
  externalLinks: { url: string; sourcePage: string }[];
}

export async function crawlSite(
  probe: HttpProbe,
  startUrl: string,
  opts?: { maxPages?: number; maxExternalLinks?: number; timeoutMs?: number }
): Promise<CrawlResult> {
  const maxPages = opts?.maxPages ?? DEFAULT_MAX_PAGES;
  const maxExternalLinks = opts?.maxExternalLinks ?? DEFAULT_MAX_EXTERNAL_LINKS;
  const origin = new URL(startUrl).origin;

  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const pages: CrawledPage[] = [];
  const externalSeen = new Set<string>();
  const externalLinks: { url: string; sourcePage: string }[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift();
    if (next === undefined || visited.has(next)) continue;
    visited.add(next);
    const result = await probe.get(next, opts?.timeoutMs === undefined ? undefined : { timeoutMs: opts.timeoutMs });
    pages.push({ url: next, finalUrl: result.finalUrl, status: result.status, bodyText: result.bodyText });
    if (result.status >= 400) continue; // don't crawl links out of a broken page
    const hrefs = resolveLinks(result.finalUrl, extractHrefs(result.bodyText));
    for (const href of hrefs) {
      let hrefOrigin: string;
      try {
        hrefOrigin = new URL(href).origin;
      } catch {
        continue;
      }
      if (hrefOrigin === origin) {
        if (!visited.has(href) && !queue.includes(href)) queue.push(href);
      } else if (!externalSeen.has(href) && externalLinks.length < maxExternalLinks) {
        externalSeen.add(href);
        externalLinks.push({ url: href, sourcePage: next });
      }
    }
  }

  return { origin, pages, externalLinks };
}
