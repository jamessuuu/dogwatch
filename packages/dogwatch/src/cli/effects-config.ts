/**
 * Shared env-driven `src/effects` wiring for `cli/watch.ts` and
 * `cli/resume.ts` — the only two places allowed to read these variables
 * (SPEC §4: env access is `src/cli`'s job alone).
 */
import { RealGithubTransport, type GithubTransport } from "../effects/github-transport.js";
import { reconcileIndeterminateAction } from "../effects/reconcile.js";
import type { Action, RunRecord } from "../record/schema.js";

const DEFAULT_GATE_PAGE_BASE_URL = "https://dogwatch.vercel.app/gate";

/** `undefined` ⇒ no `GITHUB_TOKEN` configured — every local/dev/CI
 * invocation without the secret wired degrades honestly (no gate can
 * notify or execute) rather than ever constructing a transport that would
 * fail on its first real call. */
export function githubTransportFromEnv(): GithubTransport | undefined {
  const token = process.env.GITHUB_TOKEN;
  if (token === undefined || token.length === 0) return undefined;
  return new RealGithubTransport({ token });
}

export function gatePageBaseUrlFromEnv(): string {
  return process.env.GATE_PAGE_BASE_URL ?? DEFAULT_GATE_PAGE_BASE_URL;
}

/**
 * SPEC §9 reconciliation: scans the immediately preceding published record
 * (base `actions[]` + every amendment's `actions[]` — "the NEXT run
 * reconciles") for any `indeterminate` action with no later resolution, and
 * publishes one new action per one found. Returns `[]` when there is no
 * previous record, no transport configured, or nothing to reconcile — all
 * three are the ordinary case on almost every run.
 */
export async function reconcilePreviousIndeterminates(
  prevRecord: RunRecord | null,
  transport: GithubTransport | undefined
): Promise<Action[]> {
  if (prevRecord === null || transport === undefined) return [];
  const allPrevActions = [...prevRecord.actions, ...prevRecord.amendments.flatMap((a) => a.actions)];
  const alreadyReconciled = new Set(allPrevActions.map((a) => a.reconciliationOf).filter((x): x is string => x !== undefined));
  const pending = allPrevActions.filter(
    (a) => a.status === "indeterminate" && a.effectKey !== undefined && !alreadyReconciled.has(`${prevRecord.runId}:${a.id}`)
  );
  const resolved: Action[] = [];
  for (const action of pending) {
    if (action.effectKey === undefined) continue; // narrowed above; satisfies strict null checks
    const result = await reconcileIndeterminateAction(
      { runId: prevRecord.runId, actionId: action.id, effectKey: action.effectKey, targetRepo: action.target },
      transport
    );
    resolved.push(result.action);
  }
  return resolved;
}
