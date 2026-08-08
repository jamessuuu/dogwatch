/**
 * The advisory pipeline (SPEC §8): the one function `record/build-run.ts`
 * calls to decide the record's `llm`/`cost`/`degraded` blocks and to attach
 * `Finding.advisory` where the model spoke. Owns the budget check-before-
 * call, the degrade-path classification, and cost accounting — `triage.ts`
 * only knows how to make ONE call and validate it.
 *
 * `draft` (SPEC M5) is never referenced here — see `draft.ts`'s doc comment
 * and `unreachable.test.ts`.
 */
import type { Cost, DegradedEntry, Finding, Llm } from "../record/schema.js";
import type { PricingManifest } from "../record/pricing-schema.js";
import type { Check } from "../record/schema.js";
import { DEFAULT_BUDGET_CAPS, dayBucket, isBudgetExceeded, type BudgetCaps, type BudgetStore } from "./budget.js";
import { computeLlmCostMicroUsd } from "./cost.js";
import { TRIAGE_MODEL, triage, type TriageToolOutput } from "./triage.js";
import type { LlmClient } from "./types.js";

export interface AdvisoryPipelineOptions {
  runId: string;
  findings: readonly Finding[];
  checks: readonly Check[];
  pricing: PricingManifest;
  /** The record's `cost.method` / `pricingManifest` label (SPEC §3) — the
   * filename, not the parsed data (which travels separately as `pricing`). */
  pricingManifestLabel: string;
  now: () => number;
  /** Undefined ⇒ no credentials configured (e.g. no `ANTHROPIC_API_KEY`) —
   * degrades honestly rather than crashing or silently skipping. */
  llmClient?: LlmClient | undefined;
  budgetStore: BudgetStore;
  budgetCaps?: BudgetCaps | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface AdvisoryPipelineResult {
  findings: Finding[];
  llm: Llm;
  cost: Cost;
  degraded: DegradedEntry[];
}

function zeroCost(methodLabel: string): Cost {
  return { currency: "USD", microUsd: 0, certainty: "reported", breakdown: {}, method: methodLabel };
}

function attachAdvisory(findings: readonly Finding[], output: TriageToolOutput, model: string): Finding[] {
  const referenced = new Set(output.referencedFindingIds);
  return findings.map((f) => {
    if (!referenced.has(f.id)) return f;
    return {
      ...f,
      advisory: {
        severity: output.advisorySeverity,
        note: output.note,
        model,
        agreesWithRule: f.severity === output.advisorySeverity,
        proposedAction: output.proposedAction,
      },
    };
  });
}

export async function runAdvisoryPipeline(opts: AdvisoryPipelineOptions): Promise<AdvisoryPipelineResult> {
  if (opts.findings.length === 0) {
    return {
      findings: [...opts.findings],
      llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "no_findings" },
      cost: zeroCost(opts.pricingManifestLabel),
      degraded: [],
    };
  }

  if (opts.llmClient === undefined) {
    // No credentials configured — the closest honest fit among SPEC §8's
    // four degrade reasons: dogwatch cannot reach the API at all. Distinct
    // from M0-M2's "not_implemented" (the feature no longer doesn't exist —
    // it just has nothing to call with).
    return {
      findings: [...opts.findings],
      llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "api_error" },
      cost: zeroCost(opts.pricingManifestLabel),
      degraded: [{ component: "llm", reason: "api_error" }],
    };
  }

  const day = dayBucket(opts.now());
  const usageBefore = await opts.budgetStore.getUsage(day);
  const caps = opts.budgetCaps ?? DEFAULT_BUDGET_CAPS;
  if (isBudgetExceeded(usageBefore, caps)) {
    return {
      findings: [...opts.findings],
      llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "daily_cap" },
      cost: zeroCost(opts.pricingManifestLabel),
      degraded: [{ component: "llm", reason: "daily_cap" }],
    };
  }

  const model = opts.model ?? TRIAGE_MODEL;
  const outcome = await triage({
    client: opts.llmClient,
    runId: opts.runId,
    findings: opts.findings,
    checks: opts.checks,
    model,
    timeoutMs: opts.timeoutMs,
  });

  if (outcome.kind === "transport_error") {
    const reason = outcome.errorKind === "timeout" ? "indeterminate" : "api_error";
    return {
      findings: [...opts.findings],
      llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason },
      cost: zeroCost(opts.pricingManifestLabel),
      degraded: [{ component: "llm", reason }],
    };
  }

  // Both "ok" and "schema_reject" got a real response with real usage — the
  // API call genuinely happened and genuinely cost money either way (SPEC
  // §8: cost is accounted from provider-reported usage, never from whether
  // the content later validated).
  const microUsd = computeLlmCostMicroUsd(outcome.usage, opts.pricing);
  await opts.budgetStore.recordCall(day, {
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    microUsd,
  });
  const cost: Cost = {
    currency: "USD",
    microUsd,
    certainty: "reported",
    breakdown: { llm: microUsd },
    method: opts.pricingManifestLabel,
  };

  if (outcome.kind === "schema_reject") {
    return {
      findings: [...opts.findings],
      llm: {
        calls: 1,
        model,
        inputTokens: outcome.usage.inputTokens,
        outputTokens: outcome.usage.outputTokens,
        microUsd,
        rejected: outcome.problems,
        reason: "schema_reject",
      },
      cost,
      degraded: [{ component: "llm", reason: "schema_reject" }],
    };
  }

  return {
    findings: attachAdvisory(opts.findings, outcome.output, model),
    llm: {
      calls: 1,
      model,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      microUsd,
    },
    cost,
    degraded: [],
  };
}
