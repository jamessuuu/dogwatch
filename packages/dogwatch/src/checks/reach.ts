/**
 * `reach` family (SPEC §2): `/` reachable, final URL and redirect chain
 * unchanged. Pure, zero I/O — the probe result is handed in as `evidence`.
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const REACH_STATUS_NOT_200 = "reach.status_not_200";
export const REACH_REDIRECT_CHAIN_CHANGED = "reach.redirect_chain_changed";

export function templateStatusNot200(evidence: CheckEvidence, ctx: RuleContext): string {
  return `${ctx.request.method} ${ctx.request.url} → ${String(evidence.status ?? "no response")} at ${ctx.observedAt}`;
}

/** `evidence` for this rule always carries the previous run's recorded
 * finalUrl/redirects (or `null` on the first-ever run) in `evidence.json`,
 * so the rule stays a pure function of its own evidence (R13) — no separate
 * baseline lookup happens at verify time. */
export interface RedirectChainBaseline {
  finalUrl: string | null;
  redirects: { status: number; url: string }[] | null;
}

export function templateRedirectChainChanged(evidence: CheckEvidence, ctx: RuleContext): string {
  const baseline = (evidence.json as { baseline?: RedirectChainBaseline } | undefined)?.baseline;
  return `${ctx.request.method} ${ctx.request.url} → final URL changed from ${baseline?.finalUrl ?? "(none)"} to ${evidence.finalUrl ?? "(none)"} at ${ctx.observedAt}`;
}

export function evaluateReachStatus(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const status = evidence.status;
  if (status === undefined) {
    return {
      ruleId: REACH_STATUS_NOT_200,
      title: "/ reachable",
      verdict: "error",
      errorCode: "network_error",
      evidence,
    };
  }
  if (status !== 200) {
    return {
      ruleId: REACH_STATUS_NOT_200,
      title: "/ reachable",
      verdict: "finding",
      evidence,
      findingStatement: templateStatusNot200(evidence, ctx),
      findingSeverity: status >= 500 ? "high" : "medium",
    };
  }
  return { ruleId: REACH_STATUS_NOT_200, title: "/ reachable", verdict: "pass", evidence };
}

function sameRedirectChain(
  a: { finalUrl: string | null; redirects: { status: number; url: string }[] | null },
  b: { finalUrl: string; redirects: { status: number; url: string }[] }
): boolean {
  if (a.finalUrl !== b.finalUrl) return false;
  if (a.redirects === null) return b.redirects.length === 0;
  if (a.redirects.length !== b.redirects.length) return false;
  return a.redirects.every((hop, i) => {
    const other = b.redirects[i];
    return other?.status === hop.status && other.url === hop.url;
  });
}

export function evaluateReachRedirectChain(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const baseline = (evidence.json as { baseline?: RedirectChainBaseline } | undefined)?.baseline ?? {
    finalUrl: null,
    redirects: null,
  };
  const title = "final URL + redirect chain unchanged";
  if (evidence.finalUrl === undefined) {
    return {
      ruleId: REACH_REDIRECT_CHAIN_CHANGED,
      title,
      verdict: "error",
      errorCode: "network_error",
      evidence,
    };
  }
  // No prior baseline (first-ever observation of this target): nothing can
  // honestly be reported as "changed" yet — the check passes and the
  // evidence itself becomes the baseline for tomorrow.
  if (baseline.finalUrl === null) {
    return { ruleId: REACH_REDIRECT_CHAIN_CHANGED, title, verdict: "pass", evidence };
  }
  const unchanged = sameRedirectChain(baseline, {
    finalUrl: evidence.finalUrl,
    redirects: evidence.redirects,
  });
  if (!unchanged) {
    return {
      ruleId: REACH_REDIRECT_CHAIN_CHANGED,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateRedirectChainChanged(evidence, ctx),
      findingSeverity: "medium",
    };
  }
  return { ruleId: REACH_REDIRECT_CHAIN_CHANGED, title, verdict: "pass", evidence };
}
