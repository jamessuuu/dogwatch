/**
 * `absenceOfEvidence` (SPEC §3 / R5): required in every run, empty findings
 * or not — "a run with nothing to say publishes that it has nothing to say,
 * with the checks it ran" (SPEC §1). Pure.
 */
import type { AbsenceOfEvidence, Check, ErrorReasonCode, SkipReasonCode } from "./schema.js";

export function buildAbsenceOfEvidence(checks: readonly Check[]): AbsenceOfEvidence {
  const passes = checks.filter((c) => c.verdict === "pass");
  const byFamily: Record<string, number> = {};
  for (const c of passes) {
    byFamily[c.family] = (byFamily[c.family] ?? 0) + 1;
  }
  const notChecked: { checkId: string; reasonCode: SkipReasonCode | ErrorReasonCode }[] = [];
  for (const c of checks) {
    if (c.verdict === "skipped" && c.skipReason !== undefined) {
      notChecked.push({ checkId: c.id, reasonCode: c.skipReason });
    } else if (c.verdict === "error" && c.errorCode !== undefined) {
      notChecked.push({ checkId: c.id, reasonCode: c.errorCode });
    }
  }
  const statement =
    checks.length === 0
      ? "no checks ran this watch"
      : `${String(passes.length)} of ${String(checks.length)} checks came back clean; ${String(notChecked.length)} were skipped or errored (see notChecked).`;
  return { statement, checksClean: passes.length, byFamily, notChecked };
}
