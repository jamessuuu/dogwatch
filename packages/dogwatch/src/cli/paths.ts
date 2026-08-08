import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** packages/dogwatch/src/cli -> repo root, independent of invocation cwd. */
export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "..", "..");
}

export function defaultTargetsPath(): string {
  return join(repoRoot(), "targets.json");
}

export function defaultRunsDir(): string {
  return join(repoRoot(), "runs");
}

/** SPEC §8: "every price comes from pricing.<date>.json" — the currently
 * effective manifest. A new dated file supersedes this constant, same as
 * the literal `"pricing.2026-08-08.json"` label already stamped into every
 * record's `pricingManifest` field (`cli/watch.ts`). */
export function defaultPricingManifestPath(): string {
  return join(repoRoot(), "pricing.2026-08-08.json");
}
