import { describe, expect, it } from "vitest";
import { computeLlmCostMicroUsd } from "./cost.js";
import { TEST_PRICING_MANIFEST } from "../record/test-helper.js";

describe("computeLlmCostMicroUsd", () => {
  it("computes from provider-reported usage x the pricing manifest, never a constant", () => {
    // TEST_PRICING_MANIFEST mirrors the real pricing.2026-08-08.json:
    // $1.00/MTok in, $5.00/MTok out.
    const microUsd = computeLlmCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, TEST_PRICING_MANIFEST);
    expect(microUsd).toBe(1_000_000); // $1.00
  });

  it("sums input and output cost", () => {
    const microUsd = computeLlmCostMicroUsd({ inputTokens: 500_000, outputTokens: 100_000 }, TEST_PRICING_MANIFEST);
    // 0.5 * $1.00 + 0.1 * $5.00 = $0.50 + $0.50 = $1.00
    expect(microUsd).toBe(1_000_000);
  });

  it("is zero for zero usage", () => {
    expect(computeLlmCostMicroUsd({ inputTokens: 0, outputTokens: 0 }, TEST_PRICING_MANIFEST)).toBe(0);
  });

  it("rounds to the nearest integer micro-USD (never fractional)", () => {
    const microUsd = computeLlmCostMicroUsd({ inputTokens: 1, outputTokens: 0 }, TEST_PRICING_MANIFEST);
    expect(Number.isInteger(microUsd)).toBe(true);
  });

  it("changes when the manifest's numbers change — proves it is never a hardcoded constant", () => {
    const doublePricing = {
      ...TEST_PRICING_MANIFEST,
      llm: { ...TEST_PRICING_MANIFEST.llm, inputPerMTokUsd: 2.0, outputPerMTokUsd: 10.0 },
    };
    const cheap = computeLlmCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, TEST_PRICING_MANIFEST);
    const expensive = computeLlmCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, doublePricing);
    expect(expensive).toBe(cheap * 2);
  });

  it("realistic triage-sized call costs a small fraction of a cent", () => {
    // A representative triage call: ~1,500 input tokens (evidence bundle +
    // system prompt), ~200 output tokens (a short note).
    const microUsd = computeLlmCostMicroUsd({ inputTokens: 1500, outputTokens: 200 }, TEST_PRICING_MANIFEST);
    expect(microUsd).toBeGreaterThan(0);
    expect(microUsd).toBeLessThan(10_000); // < $0.01
  });
});
