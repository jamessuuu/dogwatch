/**
 * `watch` family (SPEC §2/§12 M4): dogwatch on itself. `watch.chain_gap` is
 * the one rule this milestone wires — audit-chain continuity across runs,
 * only meaningful once the audit trail is durably anchored in Postgres
 * (`audit.store === "postgres"`). `watch.run_missed`/`watch.late` stay
 * undeclared (SPEC §3 Decision 3's `kind:"gap"` record already covers "the
 * schedule slipped a night" at the record-kind level; a dedicated
 * finding-producing check for schedule lateness is a later addition, not
 * requested by this milestone) — pure, zero I/O, like every other rule
 * module (SPEC §4).
 *
 * Why this rule compares HASHES, not sequence numbers, to detect a gap:
 * `record/build-run.ts` always queries this run's new events starting from
 * `sinceSeq: prevRecord.audit.toSeq`, so the very first event it gets back
 * is trivially `prevRecord.audit.toSeq + 1` by construction — sluice's
 * `sluice_cursor.seq` column increments by exactly 1 on every append, so
 * there is never a "hole" a seq-number comparison could observe once the
 * query is anchored at the previous run's own toSeq. What CAN genuinely
 * diverge from git's expectation is the store's `head_hash` at that same
 * position — if the Postgres audit trail was reset, restored from an older
 * backup, or otherwise regressed independently of the `sluice_cursor.seq`
 * counter, the first new event's `prevHash` (computed by the store from ITS
 * OWN persisted head, not from anything dogwatch tells it) will no longer
 * equal `prevRecord.audit.head` (what git published last night). That
 * mismatch — not a seq gap — is the real, structurally detectable failure
 * this rule exists to surface. `verify/rubric.ts`'s R11 keeps its own
 * (necessarily much weaker) seq-based comparison as a second, independent
 * safety net; a run carrying this finding is exempt from R11's stricter
 * failure so the two checks never fight each other over the same fact.
 */
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";
import type { RuleOutcome } from "./types.js";

export const WATCH_CHAIN_GAP = "watch.chain_gap";

export interface ChainGapBaseline {
  expectedFromSeq: number;
  actualFromSeq: number;
  expectedPrevHead: string | null;
  actualPrevHead: string | null;
}

function baselineOf(evidence: CheckEvidence): ChainGapBaseline {
  return (evidence.json as { chainGap: ChainGapBaseline }).chainGap;
}

export function templateWatchChainGap(evidence: CheckEvidence, ctx: RuleContext): string {
  const b = baselineOf(evidence);
  return (
    `audit chain discontinuity at ${ctx.observedAt}: expected this run's events to continue from ` +
    `seq ${String(b.expectedFromSeq)} with prevHash ${b.expectedPrevHead ?? "(none)"}, but the store's ` +
    `first new event was seq ${String(b.actualFromSeq)} with prevHash ${b.actualPrevHead ?? "(none)"}`
  );
}

export function evaluateWatchChainGap(evidence: CheckEvidence, ctx: RuleContext): RuleOutcome {
  const title = "the audit sequence is contiguous across runs";
  const b = baselineOf(evidence);
  const gap = b.expectedFromSeq !== b.actualFromSeq || b.expectedPrevHead !== b.actualPrevHead;
  if (gap) {
    return {
      ruleId: WATCH_CHAIN_GAP,
      title,
      verdict: "finding",
      evidence,
      findingStatement: templateWatchChainGap(evidence, ctx),
      findingSeverity: "high",
    };
  }
  return { ruleId: WATCH_CHAIN_GAP, title, verdict: "pass", evidence };
}
