/**
 * `header` family (SPEC §2): declared security/policy headers present;
 * value drift vs the previous record. One check per (site, declared
 * header): existence (`header.missing`) and drift (`header.value_changed`,
 * skipped when the header is absent or there is no prior baseline — those
 * are the other check's concern).
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const HEADER_MISSING = "header.missing";
export const HEADER_VALUE_CHANGED = "header.value_changed";

interface HeaderJson {
  headerName: string;
  baselineValue?: string | null;
}

function headerNameOf(evidence: CheckEvidence): string {
  const json = evidence.json as HeaderJson | undefined;
  if (json === undefined) {
    throw new TypeError("header rule evidence.json.headerName is required");
  }
  return json.headerName;
}

export function templateHeaderMissing(evidence: CheckEvidence, ctx: RuleContext): string {
  return `${ctx.request.method} ${ctx.request.url} → header "${headerNameOf(evidence)}" missing at ${ctx.observedAt}`;
}

export function templateHeaderValueChanged(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as HeaderJson;
  const name = json.headerName;
  const current = evidence.headers[name.toLowerCase()] ?? "(absent)";
  return `${ctx.request.method} ${ctx.request.url} → header "${name}" changed from "${json.baselineValue ?? "(none)"}" to "${current}" at ${ctx.observedAt}`;
}

export function evaluateHeaderPresence(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const name = headerNameOf(evidence);
  const title = `header "${name}" present`;
  const present = evidence.headers[name.toLowerCase()] !== undefined;
  if (!present) {
    return {
      ruleId: HEADER_MISSING,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateHeaderMissing(evidence, ctx),
      findingSeverity: "medium",
    };
  }
  return { ruleId: HEADER_MISSING, title, verdict: "pass", evidence };
}

export function evaluateHeaderDrift(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const name = headerNameOf(evidence);
  const title = `header "${name}" unchanged since previous run`;
  const json = evidence.json as HeaderJson;
  const current = evidence.headers[name.toLowerCase()];
  if (current === undefined) {
    return {
      ruleId: HEADER_VALUE_CHANGED,
      title,
      verdict: "skipped",
      skipReason: "not_applicable",
      evidence,
    };
  }
  const baselineValue = json.baselineValue ?? null;
  if (baselineValue === null) {
    return { ruleId: HEADER_VALUE_CHANGED, title, verdict: "skipped", skipReason: "no_baseline", evidence };
  }
  if (current !== baselineValue) {
    return {
      ruleId: HEADER_VALUE_CHANGED,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateHeaderValueChanged(evidence, ctx),
      findingSeverity: "low",
    };
  }
  return { ruleId: HEADER_VALUE_CHANGED, title, verdict: "pass", evidence };
}
