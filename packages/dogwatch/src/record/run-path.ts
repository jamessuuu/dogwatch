/** Pure (no `node:*` imports — SPEC §4 isolation rule) run-record path
 * naming, split out of `paths.ts` (which needs `node:path` for its other
 * helpers) so `record/pending-gates.ts` and `src/effects/propose.ts` can
 * compute a run's own eventual committed path without pulling `node:path`
 * into anything `src/index.ts` re-exports for the browser bundle. */

/** Repo-root-relative form of `paths.ts`'s `runRecordPath` (SPEC §3's own
 * naming convention: `runs/<YYYY>/<YYYY-MM-DD>-<runId>.json`), computed
 * from just `startedAt`/`runId` — no absolute `runsDir` needed. */
export function relativeRunRecordPath(startedAtIso: string, runId: string): string {
  const year = startedAtIso.slice(0, 4);
  const date = startedAtIso.slice(0, 10);
  return `runs/${year}/${date}-${runId}.json`;
}
