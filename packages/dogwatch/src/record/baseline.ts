/**
 * Decision 1 (SPEC §3): baselines are read from the previous published run
 * record, never from a database. Pure — `prevRecord` is handed in (already
 * read from git/disk by the caller).
 */
import type { RedirectChainBaseline } from "../checks/reach.js";
import type { Check, RunRecord } from "./schema.js";

export function findPreviousCheck(prevRecord: RunRecord | null, checkIdValue: string): Check | null {
  if (prevRecord === null) return null;
  return prevRecord.checks.find((c) => c.id === checkIdValue) ?? null;
}

export function redirectChainBaselineOf(prevRecord: RunRecord | null, checkIdValue: string): RedirectChainBaseline {
  const prev = findPreviousCheck(prevRecord, checkIdValue);
  if (prev?.evidence.finalUrl === undefined) {
    return { finalUrl: null, redirects: null };
  }
  return { finalUrl: prev.evidence.finalUrl, redirects: prev.evidence.redirects };
}

export function headerBaselineValueOf(
  prevRecord: RunRecord | null,
  checkIdValue: string,
  headerName: string
): string | null {
  const prev = findPreviousCheck(prevRecord, checkIdValue);
  if (prev === null) return null;
  return prev.evidence.headers[headerName.toLowerCase()] ?? null;
}
