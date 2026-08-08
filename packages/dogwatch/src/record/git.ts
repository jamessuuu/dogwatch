/** Node-only: read the commit dogwatch is running at (SPEC §3 `commit`). */
import { execFileSync } from "node:child_process";

export function currentGitCommit(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
