/**
 * `runAdvisoryPipeline` — SPEC §8's full degrade-path coverage: "cap trip,
 * API error, schema-reject or timeout ⇒ the deterministic summary stands
 * alone and the record publishes degraded:[{component:"llm", reason:...}].
 * Test every degrade reason."
 */
import { describe, expect, it } from "vitest";
import { runAdvisoryPipeline } from "./pipeline.js";
import { DEFAULT_BUDGET_CAPS, InMemoryBudgetStore } from "./budget.js";
import { createFakeLlmClient, fakeLlmClientAlwaysThrowing } from "./test-helper.js";
import { LlmError } from "./types.js";
import { makeCheck, makeFinding, TEST_PRICING_MANIFEST } from "../record/test-helper.js";
import type { Finding } from "../record/schema.js";

const NOW = () => Date.parse("2026-08-08T15:00:00.000Z");

function oneFinding(overrides?: Partial<Finding>): Finding {
  return makeFinding({
    id: "F-abc123",
    checkId: "link:agentjames:link.unverifiable:https://example.com/",
    ruleId: "link.unverifiable",
    severity: "low",
    sources: [
      {
        url: "https://example.com/",
        method: "HEAD",
        status: 999,
        retrievedAt: "2026-08-08T15:00:00.000Z",
        evidencePath: `checks[?(@.id=="link:agentjames:link.unverifiable:https://example.com/")].evidence`,
      },
    ],
    ...overrides,
  });
}

const oneCheck = makeCheck({
  id: "link:agentjames:link.unverifiable:https://example.com/",
  ruleId: "link.unverifiable",
  family: "link",
  verdict: "finding",
  evidence: { status: 999, redirects: [], headers: {} },
});

describe("runAdvisoryPipeline — quiet night", () => {
  it("publishes exactly llm:{calls:0, reason:'no_findings'} and microUsd 0 — no client, no budget store touched", async () => {
    const budgetStore = new InMemoryBudgetStore();
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [],
      checks: [],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: createFakeLlmClient([]), // must never be called
      budgetStore,
    });
    expect(result.llm).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "no_findings" });
    expect(result.cost).toEqual({ currency: "USD", microUsd: 0, certainty: "reported", breakdown: {}, method: "pricing.2026-08-08.json" });
    expect(result.degraded).toEqual([]);
    expect(await budgetStore.getUsage("2026-08-08")).toEqual({ day: "2026-08-08", llmCalls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0 });
  });
});

describe("runAdvisoryPipeline — degrade path (one test per SPEC §8 reason)", () => {
  it("api_error: no llmClient configured (e.g. no ANTHROPIC_API_KEY)", async () => {
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [oneFinding()],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: undefined,
      budgetStore: new InMemoryBudgetStore(),
    });
    expect(result.llm).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "api_error" });
    expect(result.cost.microUsd).toBe(0);
    expect(result.degraded).toEqual([{ component: "llm", reason: "api_error" }]);
    expect(result.findings[0]?.advisory).toBeUndefined();
  });

  it("daily_cap: the budget check runs BEFORE any call — the client is never touched", async () => {
    const budgetStore = new InMemoryBudgetStore();
    await budgetStore.recordCall("2026-08-08", { inputTokens: 0, outputTokens: 0, microUsd: 0 });
    // Force the cap by pre-seeding calls up to the ceiling.
    for (let i = 1; i < DEFAULT_BUDGET_CAPS.maxCallsPerDay; i++) {
      await budgetStore.recordCall("2026-08-08", { inputTokens: 0, outputTokens: 0, microUsd: 0 });
    }
    const client = createFakeLlmClient([]); // queue empty — a call would throw
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [oneFinding()],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore,
    });
    expect(result.llm.reason).toBe("daily_cap");
    expect(result.llm.calls).toBe(0);
    expect(result.degraded).toEqual([{ component: "llm", reason: "daily_cap" }]);
    expect(client.calls).toHaveLength(0);
  });

  it("indeterminate: a caller-side timeout", async () => {
    const client = fakeLlmClientAlwaysThrowing(new LlmError("timeout", "took too long"));
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [oneFinding()],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore: new InMemoryBudgetStore(),
    });
    expect(result.llm).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "indeterminate" });
    expect(result.degraded).toEqual([{ component: "llm", reason: "indeterminate" }]);
  });

  it("api_error: a transport/API failure from the client", async () => {
    const client = fakeLlmClientAlwaysThrowing(new LlmError("api_error", "500 from provider"));
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [oneFinding()],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore: new InMemoryBudgetStore(),
    });
    expect(result.llm).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "api_error" });
    expect(result.degraded).toEqual([{ component: "llm", reason: "api_error" }]);
  });

  it("schema_reject: a real response that fails validation still charges real cost and records the budget", async () => {
    const budgetStore = new InMemoryBudgetStore();
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "not-a-real-severity", note: "x", referencedFindingIds: [], proposedAction: "none" },
        usage: { inputTokens: 1000, outputTokens: 50 },
      }),
    ]);
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [oneFinding()],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore,
    });
    expect(result.llm.calls).toBe(1);
    expect(result.llm.reason).toBe("schema_reject");
    expect(result.llm.inputTokens).toBe(1000);
    expect(result.llm.outputTokens).toBe(50);
    expect(result.llm.rejected?.length).toBeGreaterThan(0);
    expect(result.cost.microUsd).toBeGreaterThan(0); // real cost was incurred
    expect(result.degraded).toEqual([{ component: "llm", reason: "schema_reject" }]);
    expect(result.findings[0]?.advisory).toBeUndefined();
    // The budget store was updated even though the response was rejected —
    // the API call genuinely happened.
    expect((await budgetStore.getUsage("2026-08-08")).llmCalls).toBe(1);
  });
});

describe("runAdvisoryPipeline — successful triage", () => {
  it("attaches advisory only to referenced findings, computing agreesWithRule per finding", async () => {
    const referenced = oneFinding({ id: "F-referenced", severity: "high" });
    const notReferenced = oneFinding({ id: "F-not-referenced", severity: "low" });
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "medium", note: "Disagrees with the rule on F-referenced.", referencedFindingIds: ["F-referenced"], proposedAction: "open_issue" },
        usage: { inputTokens: 1500, outputTokens: 100 },
      }),
    ]);
    const budgetStore = new InMemoryBudgetStore();
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [referenced, notReferenced],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore,
    });
    expect(result.llm.calls).toBe(1);
    expect(result.llm.reason).toBeUndefined();
    expect(result.degraded).toEqual([]);

    const referencedResult = result.findings.find((f) => f.id === "F-referenced");
    expect(referencedResult?.advisory).toEqual({
      severity: "medium",
      note: "Disagrees with the rule on F-referenced.",
      model: "claude-haiku-4-5",
      agreesWithRule: false, // rule said "high", advisory said "medium"
      proposedAction: "open_issue",
    });

    const notReferencedResult = result.findings.find((f) => f.id === "F-not-referenced");
    expect(notReferencedResult?.advisory).toBeUndefined();

    expect(result.cost.microUsd).toBeGreaterThan(0);
    expect(result.cost.breakdown).toEqual({ llm: result.cost.microUsd });
    expect((await budgetStore.getUsage("2026-08-08")).llmCalls).toBe(1);
  });

  it("agreesWithRule is true when the advisory severity matches the rule's own severity", async () => {
    const finding = oneFinding({ id: "F-agree", severity: "low" });
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: "Agrees.", referencedFindingIds: ["F-agree"], proposedAction: "none" },
        usage: { inputTokens: 100, outputTokens: 20 },
      }),
    ]);
    const result = await runAdvisoryPipeline({
      runId: "run-1",
      findings: [finding],
      checks: [oneCheck],
      pricing: TEST_PRICING_MANIFEST,
      pricingManifestLabel: "pricing.2026-08-08.json",
      now: NOW,
      llmClient: client,
      budgetStore: new InMemoryBudgetStore(),
    });
    expect(result.findings[0]?.advisory?.agreesWithRule).toBe(true);
  });
});
