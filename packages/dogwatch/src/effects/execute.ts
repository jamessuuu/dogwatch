/**
 * Executes an APPROVED action's governed effect exactly once (SPEC §5 step
 * 5, §9): the outward `github.issue.open` call, through `sluice.run()` with
 * the SAME intent-derived `effectKey` `propose.ts` computed — replaying
 * safely across duplicate pollers and a crash mid-execute, because the key
 * (not "did we already try") is what sluice's claim/lease mechanism keys
 * off. `onIndeterminate:'fail'` (sluice's own default, set explicitly here
 * for clarity) is what makes a lost response publish verbatim rather than
 * silently retrying into a possible second issue.
 *
 * The hidden `<!-- dogwatch:effect:<key> -->` marker is stamped into the
 * ACTUAL sibling-repo issue body here — `reconcile.ts` is what searches for
 * it on a later run.
 */
import { SluiceError, type Sluice, type Json } from "@jamessuuu/sluice";
import type { GithubTransport } from "./github-transport.js";
import { effectMarker } from "./reconcile.js";
import type { ResumeContext } from "./resume-context.js";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface ExecuteContext {
  sluice: Sluice;
  githubTransport: GithubTransport;
}

export interface Draft {
  title: string;
  body: string;
}

export type ExecuteOutcome =
  | { status: "executed"; effectOutcome: string; artifactUrl: string }
  | { status: "indeterminate"; effectOutcome: string }
  | { status: "failed"; reasonCode: "effect_failed"; detail: string };

interface IssueEffectValue extends Record<string, Json> {
  number: number;
  url: string;
}

export async function executeApprovedAction(resumeCtx: ResumeContext, draft: Draft, ctx: ExecuteContext): Promise<ExecuteOutcome> {
  try {
    const outcome = await ctx.sluice.run<IssueEffectValue>(
      { key: resumeCtx.effectKey, retentionMs: NINETY_DAYS_MS, onIndeterminate: "fail" },
      async () => {
        const ref = await ctx.githubTransport.openIssue({
          repo: resumeCtx.targetRepo,
          title: draft.title,
          body: `${draft.body}\n\n${effectMarker(resumeCtx.effectKey)}`,
        });
        return { number: ref.number, url: ref.url };
      }
    );
    if (outcome.status === "executed") {
      return { status: "executed", effectOutcome: `issue ${outcome.value.url}`, artifactUrl: outcome.value.url };
    }
    // "replayed": sluice already ran this effect (an earlier resume attempt
    // succeeded and this poller lost the race, or a duplicate poller ran
    // concurrently) — exactly-once means THIS outcome is the same
    // "executed" fact, not a second issue.
    if (outcome.value === undefined) {
      return { status: "executed", effectOutcome: "issue created (result omitted — over size cap)", artifactUrl: resumeCtx.targetRepo };
    }
    return { status: "executed", effectOutcome: `issue ${outcome.value.url} (replayed)`, artifactUrl: outcome.value.url };
  } catch (cause) {
    if (cause instanceof SluiceError && cause.indeterminate) {
      // SPEC §9: "onIndeterminate:'fail' ⇒ published verbatim (we do not
      // know whether the issue was created; not retried)".
      return {
        status: "indeterminate",
        effectOutcome: "we do not know whether the issue was created; not retried (see reconciliation)",
      };
    }
    return {
      status: "failed",
      reasonCode: "effect_failed",
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
