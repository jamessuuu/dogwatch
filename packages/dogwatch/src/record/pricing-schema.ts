/**
 * `pricing.<date>.json` — config, not code (SPEC §8: "every price comes from
 * pricing.<date>.json, never a constant"). Zod source of truth for the
 * numbers `src/llm/cost.ts` multiplies provider-reported usage by. This
 * module imports nothing from `node:*` — the loader (`pricing-io.ts`) is the
 * only place that touches the filesystem, same split as targets.json.
 */
import { z } from "zod";

export const PricingManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  effectiveDate: z.string().min(1),
  note: z.string(),
  llm: z.strictObject({
    provider: z.string().min(1),
    model: z.string().min(1),
    inputPerMTokUsd: z.number().nonnegative(),
    outputPerMTokUsd: z.number().nonnegative(),
  }),
  infra: z.strictObject({
    githubActionsPerMinuteUsd: z.number().nonnegative(),
    githubActionsNote: z.string(),
    neonComputePerCuHourUsd: z.number().nonnegative(),
    neonComputeNote: z.string(),
  }),
});
export type PricingManifest = z.infer<typeof PricingManifestSchema>;
