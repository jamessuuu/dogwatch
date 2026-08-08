/**
 * `brand` family (SPEC §2 / BRAND-KIT.md): footer attribution + backlink to
 * agentjames on every crawled page, chip-mark favicon reachable. Applies to
 * the sibling tool sites (BRAND-KIT.md requires every sibling repo to link
 * back to the portfolio hub); the hub itself is intentionally excluded in
 * `targets.json` (it does not backlink to itself).
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const BRAND_BACKLINK_MISSING = "brand.backlink_missing";
export const BRAND_FAVICON_MISSING = "brand.favicon_missing";

const BACKLINK_HOST = "agentjames.vercel.app";

interface BacklinkJson {
  page: string;
  bodyContainsBacklink: boolean;
}

export function templateBacklinkMissing(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as BacklinkJson;
  return `${ctx.request.method} ${json.page} → no footer link to ${BACKLINK_HOST} found at ${ctx.observedAt}`;
}

export function templateFaviconMissing(evidence: CheckEvidence, ctx: RuleContext): string {
  return `${ctx.request.method} ${ctx.request.url} → favicon → ${String(evidence.status ?? "no response")} at ${ctx.observedAt}`;
}

/** Evidence carries the already-computed boolean (SPEC §3: evidence records
 * observed facts, not raw page bodies — mirrors `bodySha256` over a raw
 * body). The crawl/detection itself happens in the record builder using the
 * injected probe; this function only judges the recorded fact. */
export function evaluateBrandBacklink(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const json = evidence.json as BacklinkJson;
  const title = `footer links back to ${BACKLINK_HOST}`;
  if (!json.bodyContainsBacklink) {
    return {
      ruleId: BRAND_BACKLINK_MISSING,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateBacklinkMissing(evidence, ctx),
      findingSeverity: "low",
    };
  }
  return { ruleId: BRAND_BACKLINK_MISSING, title, verdict: "pass", evidence };
}

export function evaluateBrandFavicon(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const title = "chip-mark favicon reachable";
  if (evidence.status !== 200) {
    return {
      ruleId: BRAND_FAVICON_MISSING,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateFaviconMissing(evidence, ctx),
      findingSeverity: "low",
    };
  }
  return { ruleId: BRAND_FAVICON_MISSING, title, verdict: "pass", evidence };
}
