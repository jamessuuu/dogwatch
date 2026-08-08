/** Node-only: load + validate `targets.json`, and hash its raw bytes (SPEC
 * §3: "Its sha256 is stamped into every record; a change to it is visible
 * in the diff of the next run"). */
import { readFileSync } from "node:fs";
import { sha256Hex } from "@jamessuuu/sluice";
import { TargetsFileSchema, type TargetsFile } from "./targets-schema.js";

export interface LoadedTargets {
  targets: TargetsFile;
  targetsHash: string;
}

export function loadTargets(path: string): LoadedTargets {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const result = TargetsFileSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`${path} is not a valid targets.json (${detail})`);
  }
  return { targets: result.data, targetsHash: sha256Hex(raw) };
}
