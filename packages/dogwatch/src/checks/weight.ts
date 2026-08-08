/**
 * `weight` family (SPEC §2): transfer bytes of `/` vs a declared budget
 * (deterministic). Timings are recorded as metrics only, never findings
 * (R14 — no metric may carry a severity or appear in findings).
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const WEIGHT_BUDGET_EXCEEDED = "weight.budget_exceeded";

interface WeightJson {
  budgetBytes: number;
}

export function templateBudgetExceeded(evidence: CheckEvidence, ctx: RuleContext): string {
  const json = evidence.json as WeightJson;
  return `${ctx.request.method} ${ctx.request.url} → ${String(evidence.bytes ?? 0)} bytes exceeds the ${String(json.budgetBytes)}-byte budget at ${ctx.observedAt}`;
}

export function evaluateWeightBudget(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const json = evidence.json as WeightJson;
  const title = `/ transfer size within the ${String(json.budgetBytes)}-byte budget`;
  const bytes = evidence.bytes;
  if (bytes === undefined) {
    return { ruleId: WEIGHT_BUDGET_EXCEEDED, title, verdict: "error", errorCode: "network_error", evidence };
  }
  if (bytes > json.budgetBytes) {
    return {
      ruleId: WEIGHT_BUDGET_EXCEEDED,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateBudgetExceeded(evidence, ctx),
      findingSeverity: "low",
    };
  }
  return { ruleId: WEIGHT_BUDGET_EXCEEDED, title, verdict: "pass", evidence };
}
