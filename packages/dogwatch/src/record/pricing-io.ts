/** Node-only: load + validate `pricing.<date>.json` (SPEC §8). The record's
 * `pricingManifest` field stays the plain filename string (unchanged, see
 * `schema.ts`) — this loader hands back the parsed NUMBERS `src/llm/cost.ts`
 * needs, so the label and the data it references travel separately, the
 * same split `targets.json`/`targets-io.ts` already uses. */
import { readFileSync } from "node:fs";
import { PricingManifestSchema, type PricingManifest } from "./pricing-schema.js";

export function loadPricingManifest(path: string): PricingManifest {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const result = PricingManifestSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`${path} is not a valid pricing manifest (${detail})`);
  }
  return result.data;
}
