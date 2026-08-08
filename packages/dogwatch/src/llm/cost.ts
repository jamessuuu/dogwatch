/**
 * Cost accounting (SPEC §8): "Cost is reported in integer micro-USD from
 * provider-reported usage × the pricing manifest (never constants)." Pure —
 * no I/O, no clock. `usage` always comes from `LlmToolResponse.usage`
 * (provider-reported), never estimated.
 */
import type { PricingManifest } from "../record/pricing-schema.js";
import type { LlmUsage } from "./types.js";

const USD_PER_MICRO_USD = 1_000_000;

export function computeLlmCostMicroUsd(usage: LlmUsage, pricing: PricingManifest): number {
  const inputUsd = (usage.inputTokens / 1_000_000) * pricing.llm.inputPerMTokUsd;
  const outputUsd = (usage.outputTokens / 1_000_000) * pricing.llm.outputPerMTokUsd;
  return Math.round((inputUsd + outputUsd) * USD_PER_MICRO_USD);
}
