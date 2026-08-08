import { describe, expect, it } from "vitest";
import { evaluateWeightBudget } from "./weight.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "agentjames",
  checkId: "weight:agentjames:weight.budget_exceeded",
  request: { method: "GET", url: "https://agentjames.vercel.app" },
  observedAt: "2026-08-08T15:00:00.000Z",
};

describe("evaluateWeightBudget", () => {
  it("passes when transfer bytes are within budget", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {}, bytes: 100_000, json: { budgetBytes: 300_000 } };
    expect(evaluateWeightBudget(evidence, ctx).verdict).toBe("pass");
  });

  it("finds low severity when transfer bytes exceed the budget", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {}, bytes: 400_000, json: { budgetBytes: 300_000 } };
    const outcome = evaluateWeightBudget(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
    expect(outcome.findingStatement).toContain("400000 bytes exceeds the 300000-byte budget");
  });

  it("errors when bytes is missing", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {}, json: { budgetBytes: 300_000 } };
    expect(evaluateWeightBudget(evidence, ctx).verdict).toBe("error");
  });

  it("passes exactly at the budget boundary (not exceeded)", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {}, bytes: 300_000, json: { budgetBytes: 300_000 } };
    expect(evaluateWeightBudget(evidence, ctx).verdict).toBe("pass");
  });
});
