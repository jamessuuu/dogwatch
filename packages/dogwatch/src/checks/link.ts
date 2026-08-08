/**
 * `link` family (SPEC §2): bounded same-origin crawl ≤30 pages/site;
 * external links HEAD-checked (≤60/site, 7-day result cache from the
 * previous record). This module judges ONE already-fetched link at a time;
 * the crawl/discovery orchestration (which needs the injected probe) lives
 * in src/probe/crawl.ts.
 *
 * Bot-block classification (fix, 2026-08-09): the first published run
 * reported `HEAD https://www.ebizolution.com/ → 403` and
 * `HEAD https://www.linkedin.com/in/... → 999` as `link.broken`. Both are
 * TRUE statements about the request dogwatch made, but neither is evidence
 * the link is dead — 999 is LinkedIn's own non-standard "no bots" status and
 * 403/406/429 on a HEAD-only request is the shape of a WAF/anti-bot rule,
 * not a broken resource. Reporting those every night forever is exactly the
 * "scheduled noise" SPEC §2's honesty guards exist to prevent. `link.broken`
 * now means "dogwatch made one or two requests and the resource is
 * genuinely gone"; `link.unverifiable` means "dogwatch made two requests and
 * still cannot tell" — a real, low-severity, non-noisy statement.
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const LINK_BROKEN = "link.broken";
export const LINK_OFFSITE_REDIRECT = "link.offsite_redirect";
export const LINK_UNVERIFIABLE = "link.unverifiable";

/**
 * HEAD statuses that are commonly issued by a WAF/anti-bot layer rather than
 * by the resource itself: LinkedIn's own non-standard 999 "unauthorized
 * bot-like request" status, 403 Forbidden, 406 Not Acceptable, and 429 Too
 * Many Requests — the shapes a bot-detection rule hands a HEAD-only crawler
 * while a real browser sails through unaffected. A status in this set is
 * never classified straight to `link.broken`; it is always retried once
 * with GET first (see `build-site.ts`).
 */
export const BOT_BLOCK_HEAD_STATUSES: ReadonlySet<number> = new Set([403, 406, 429, 999]);

export function isBotBlockHeadStatus(status: number | undefined): boolean {
  return status !== undefined && BOT_BLOCK_HEAD_STATUSES.has(status);
}

/** The second, GET, observation recorded when the first HEAD response had a
 * bot-block shape. Both observations travel together in one check's
 * evidence so the finding statement (if any) is a literal statement about
 * every request dogwatch made for this link, not just the first one. */
export interface LinkRetry {
  method: "GET";
  /** Absent when the retry itself failed to complete (timeout/network
   * error) — a third, still-honest, outcome: "we tried twice and got no
   * usable answer either time." */
  status?: number;
  finalUrl?: string;
}

interface LinkJson {
  linkUrl: string;
  sourcePage: string;
  sourceOrigin?: string;
  retry?: LinkRetry;
}

function retryStatusText(retry: LinkRetry | undefined): string {
  if (retry === undefined) return "no retry recorded";
  return `retried GET → ${retry.status === undefined ? "no response" : String(retry.status)}`;
}

export function templateLinkBroken(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as LinkJson;
  const base = `${ctx.request.method} ${json.linkUrl} (linked from ${json.sourcePage}) → ${String(evidence.status ?? "no response")} at ${ctx.observedAt}`;
  // A finding.statement must be a literal statement about every request
  // dogwatch made for this link (SPEC §2 editorial rule) — when the initial
  // HEAD had a bot-block shape but the GET retry confirms genuine deadness
  // (404/410), the retry is part of the evidence for this finding too.
  return json.retry === undefined ? base : `${base}; ${retryStatusText(json.retry)}`;
}

export function templateLinkUnverifiable(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as LinkJson;
  return `HEAD ${json.linkUrl} (linked from ${json.sourcePage}) → ${String(evidence.status ?? "no response")}; ${retryStatusText(json.retry)} at ${ctx.observedAt}`;
}

export function evaluateLinkBroken(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const json = evidence.json as LinkJson;
  const title = `link ${json.linkUrl} resolves`;
  const status = evidence.status;

  if (isBotBlockHeadStatus(status)) {
    const retryStatus = json.retry?.status;
    if (retryStatus !== undefined && retryStatus < 400) {
      // The GET retry succeeded — this is a server that mishandles HEAD
      // (or a WAF rule that only fires on HEAD), not a broken link.
      return { ruleId: LINK_BROKEN, title, verdict: "pass", evidence };
    }
    if (retryStatus === 404 || retryStatus === 410) {
      // The GET retry independently confirms "not found" — the bot-block
      // shape on HEAD was incidental; this link is genuinely dead.
      return {
        ruleId: LINK_BROKEN,
        title,
        verdict: "finding",
        evidence,
        findingStatement: templateLinkBroken(evidence, ctx),
        findingSeverity: "medium",
      };
    }
    // Two requests made, still no usable answer (retry absent, retry
    // errored, retry repeated the block, or retry returned something else
    // ambiguous). This is not a statement dogwatch can honestly make about
    // the link's liveness — publish the low-severity, non-noisy truth.
    return {
      ruleId: LINK_UNVERIFIABLE,
      title: `link ${json.linkUrl} could not be verified (bot-block shape)`,
      verdict: "finding",
      evidence,
      findingStatement: templateLinkUnverifiable(evidence, ctx),
      findingSeverity: "low",
    };
  }

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

/** Registered separately in `checks/index.ts`'s `RULES_BY_ID[LINK_UNVERIFIABLE]`
 * so R13 rerun (`dogwatch verify --rerun-rules`) can re-derive a
 * `link.unverifiable` finding by its own ruleId — it is the SAME classifier
 * as `evaluateLinkBroken` (one check can only ever have one ruleId; which
 * one applies is a property of the evidence, decided once, here). */
export const evaluateLinkUnverifiable = evaluateLinkBroken;

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

export function templateOffsiteRedirect(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as LinkJson;
  return `${ctx.request.method} ${json.linkUrl} (linked from ${json.sourcePage}) → redirected off-site to ${evidence.finalUrl ?? "(none)"} at ${ctx.observedAt}`;
}
