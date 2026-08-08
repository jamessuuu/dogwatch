/**
 * `link` family (SPEC §2): bounded same-origin crawl ≤30 pages/site;
 * external links HEAD-checked (≤60/site, 7-day result cache from the
 * previous record). This module judges ONE already-fetched link at a time;
 * the crawl/discovery orchestration (which needs the injected probe) lives
 * in src/probe/crawl.ts.
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const LINK_BROKEN = "link.broken";
export const LINK_OFFSITE_REDIRECT = "link.offsite_redirect";

interface LinkJson {
  linkUrl: string;
  sourcePage: string;
  sourceOrigin?: string;
}

export function templateLinkBroken(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as LinkJson;
  return `${ctx.request.method} ${json.linkUrl} (linked from ${json.sourcePage}) → ${String(evidence.status ?? "no response")} at ${ctx.observedAt}`;
}

export function templateOffsiteRedirect(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as LinkJson;
  return `${ctx.request.method} ${json.linkUrl} (linked from ${json.sourcePage}) → redirected off-site to ${evidence.finalUrl ?? "(none)"} at ${ctx.observedAt}`;
}

export function evaluateLinkBroken(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const json = evidence.json as LinkJson;
  const title = `link ${json.linkUrl} resolves`;
  const status = evidence.status;
  if (status === undefined || status >= 400) {
    return {
      ruleId: LINK_BROKEN,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateLinkBroken(evidence, ctx),
      findingSeverity: "medium",
    };
  }
  return { ruleId: LINK_BROKEN, title, verdict: "pass", evidence };
}

function originOf(url: string): string {
  return new URL(url).origin;
}

export function evaluateLinkOffsiteRedirect(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const json = evidence.json as LinkJson;
  const title = `link ${json.linkUrl} stays on its declared origin`;
  if (json.sourceOrigin === undefined || evidence.finalUrl === undefined) {
    return { ruleId: LINK_OFFSITE_REDIRECT, title, verdict: "skipped", skipReason: "not_applicable", evidence };
  }
  const wasSameOrigin = originOf(json.linkUrl) === json.sourceOrigin;
  if (!wasSameOrigin) {
    // This rule only judges links that started same-origin (SPEC: a link
    // that was ALREADY external redirecting elsewhere is not a drift).
    return { ruleId: LINK_OFFSITE_REDIRECT, title, verdict: "skipped", skipReason: "not_applicable", evidence };
  }
  if (originOf(evidence.finalUrl) !== json.sourceOrigin) {
    return {
      ruleId: LINK_OFFSITE_REDIRECT,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateOffsiteRedirect(evidence, ctx),
      findingSeverity: "medium",
    };
  }
  return { ruleId: LINK_OFFSITE_REDIRECT, title, verdict: "pass", evidence };
}
