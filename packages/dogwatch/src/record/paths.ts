import { join } from "node:path";

/** `runs/<YYYY>/<YYYY-MM-DD>-<runId>.json` (SPEC §3). */
export function runRecordPath(runsDir: string, startedAtIso: string, runId: string): string {
  const year = startedAtIso.slice(0, 4);
  const date = startedAtIso.slice(0, 10);
  return join(runsDir, year, `${date}-${runId}.json`);
}

export function runIndexPath(runsDir: string): string {
  return join(runsDir, "index.json");
}
