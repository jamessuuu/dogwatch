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
