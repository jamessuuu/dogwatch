/**
 * Reconciliation (SPEC §9): "GitHub API fails mid-issue-create... indeterminate
 * ⇒ onIndeterminate:'fail' ⇒ published verbatim..., and the NEXT run
 * reconciles by searching the repo for the hidden marker
 * `<!-- dogwatch:effect:<key> -->` and publishes the resolution."
 *
 * `effectMarker` is shared with `execute.ts` (the marker `execute.ts`
 * stamps into the real issue body is byte-identical to the one this module
 * searches for — one definition, not two independently-typed strings that
 * could drift apart).
 */
import type { Action } from "../record/schema.js";
import type { GithubTransport } from "./github-transport.js";

export function effectMarker(effectKey: string): string {
  return `<!-- dogwatch:effect:${effectKey} -->`;
}

export interface ReconcileResult {
  /** A NEW action entry publishing the resolution — always carries
   * `reconciliationOf: "<runId>:<actionId>"` pointing at the indeterminate
   * action being resolved (schema.ts's `Action.reconciliationOf`). */
  action: Action;
}

/**
 * Called once per still-unresolved `indeterminate` action found in an
 * earlier run's (base record or amendment) `actions[]`. Searches the
 * target repo for the marker and publishes a NEW action reporting what was
 * actually found — `executed` (marker found: the effect landed after all)
 * or `refused{reasonCode:"effect_failed"}` (marker absent after a real
 * search: it genuinely never landed). This is a REPORTING step only: the
 * frozen sluice consumer surface has no primitive to rewrite an effect
 * record's status from outside `run()`, so sluice's own `sluice_effect` row
 * for this key stays `indeterminate` forever — dogwatch's published action
 * history, not sluice's internal ledger, is the corrected source of truth
 * from this point on. The key is never retried through `sluice.run()`
 * again (retrying an already-indeterminate key without an explicit
 * `onIndeterminate:'reclaim'` opt-in would itself throw E_INDETERMINATE —
 * and reclaiming would risk a second issue in the "marker found" case,
 * which is exactly the outcome reconciliation exists to prevent).
 */
export async function reconcileIndeterminateAction(
  indeterminate: { runId: string; actionId: string; effectKey: string; targetRepo: string },
  transport: GithubTransport
): Promise<ReconcileResult> {
  const marker = effectMarker(indeterminate.effectKey);
  const found = await transport.findIssueByMarker(indeterminate.targetRepo, marker);
  const reconciliationOf = `${indeterminate.runId}:${indeterminate.actionId}`;
  if (found === null) {
    return {
      action: {
        id: `A-recon-${indeterminate.actionId}`,
        kind: "issue.open",
        target: indeterminate.targetRepo,
        status: "refused",
        effectKey: indeterminate.effectKey,
        reasonCode: "effect_failed",
        reconciliationOf,
      },
    };
  }
  return {
    action: {
      id: `A-recon-${indeterminate.actionId}`,
      kind: "issue.open",
      target: indeterminate.targetRepo,
      status: "executed",
      effectKey: indeterminate.effectKey,
      effectOutcome: `issue ${found.url} (reconciled: found existing via marker search)`,
      artifactUrl: found.url,
      reconciliationOf,
    },
  };
}
