/** Node-only: atomic file writes (tmp + rename — same pattern snapgauge uses
 * for its snapshot writer) for run records and `runs/index.json`. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { canonicalStringify } from "./canonical.js";

export function writeJsonFileAtomic(path: string, value: unknown): void {
  const text = canonicalStringify(value);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${String(process.pid)}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

export function readJsonFileIfExists(path: string): unknown {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
