/**
 * `dogwatch resume` (SPEC §5 step 5, §6, §12 M5): sweep timeouts → claim
 * decided gates → execute the approved ones exactly once → append an
 * amendment (hash-linked, never rewriting the base record) → close the
 * gate's notification issue with the outcome → (the CALLER clears
 * `state/pending-gates.json` once every claim this call made is acked —
 * `cli/resume.ts`'s job, since it owns the file I/O this module is
 * injected to avoid).
 */
import type { GateClaim, Sluice } from "@jamessuuu/sluice";
import { appendAmendment } from "../record/amendment.js";
import { toAuditEventRecord } from "../record/audit-event.js";
import type { Action, Refusal, RunRecord } from "../record/schema.js";
import { executeApprovedAction, type ExecuteOutcome } from "./execute.js";
import { toGateEntry } from "./gate-entry.js";
import type { GithubTransport } from "./github-transport.js";
import { DOGWATCH_SELF_REPO } from "./propose.js";
import { ResumeContextSchema, type ResumeContext } from "./resume-context.js";

export interface ResumeDeps {
  sluice: Sluice;
  githubTransport: GithubTransport;
  /** Injected so this module never touches `node:fs` directly (testable
   * against an in-memory map; `cli/resume.ts` supplies the real reader). */
  loadRecord: (recordPath: string) => RunRecord;
  saveRecord: (recordPath: string, record: RunRecord) => void;
  now: () => number;
  leaseMs?: number | undefined;
  limit?: number | undefined;
}

export interface ResumeClaimResult {
  gateId: string;
  recordPath: string;
  outcome: Action["status"];
}

export interface ResumeSummary {
  sweptTimeouts: number;
  claimed: number;
  results: ResumeClaimResult[];
}

function draftFromPresentation(gate: GateClaim["gate"]): { title: string; body: string } {
  const details = gate.presentation?.details as { body?: unknown } | undefined;
  const body = typeof details?.body === "string" ? details.body : (gate.presentation?.summary ?? "");
  return { title: gate.presentation?.title ?? `dogwatch gate ${gate.id}`, body };
}

function outcomeToAction(gateId: string, resumeCtx: ResumeContext, outcome: ExecuteOutcome): Action {
  if (outcome.status === "executed") {
    return {
      id: resumeCtx.actionId,
      kind: "issue.open",
      target: resumeCtx.targetRepo,
      status: "executed",
      gateId,
      effectKey: resumeCtx.effectKey,
      effectOutcome: outcome.effectOutcome,
      artifactUrl: outcome.artifactUrl,
    };
  }
  if (outcome.status === "indeterminate") {
    return {
      id: resumeCtx.actionId,
      kind: "issue.open",
      target: resumeCtx.targetRepo,
      status: "indeterminate",
      gateId,
      effectKey: resumeCtx.effectKey,
      effectOutcome: outcome.effectOutcome,
    };
  }
  return {
    id: resumeCtx.actionId,
    kind: "issue.open",
    target: resumeCtx.targetRepo,
    status: "refused",
    gateId,
    effectKey: resumeCtx.effectKey,
    reasonCode: outcome.reasonCode,
  };
}

/** A gate that resolved WITHOUT ever being approved (rejected / timed_out /
 * cancelled) — no effect is ever attempted; SPEC §9: "No action, no
 * escalation, no retry." on timeout, and the same fail-closed shape applies
 * to an explicit reject or an operator cancel. */
function refusedActionFor(gateId: string, resumeCtx: ResumeContext, reasonCode: "rejected" | "gate_timed_out"): Action {
  return {
    id: resumeCtx.actionId,
    kind: "issue.open",
    target: resumeCtx.targetRepo,
    status: "refused",
    gateId,
    effectKey: resumeCtx.effectKey,
    reasonCode,
  };
}

function summaryLineFor(action: Action): string {
  if (action.status === "executed") return `executed — ${action.effectOutcome ?? ""}`;
  if (action.status === "indeterminate") return `indeterminate — ${action.effectOutcome ?? ""}`;
  return `refused — ${action.reasonCode ?? "unknown"}`;
}

export async function runResume(deps: ResumeDeps): Promise<ResumeSummary> {
  const sweptTimeouts = await deps.sluice.gates.sweepTimeouts();
  const claims = await deps.sluice.gates.claimDecided({
    ...(deps.leaseMs === undefined ? {} : { leaseMs: deps.leaseMs }),
    ...(deps.limit === undefined ? {} : { limit: deps.limit }),
  });

  const results: ResumeClaimResult[] = [];

  for (const claim of claims) {
    const gate = claim.gate;
    const parsedCtx = ResumeContextSchema.safeParse(gate.resumeContext);
    if (!parsedCtx.success) {
      // No resumeContext (or a malformed one) — nothing to execute or amend
      // against. Ack anyway so a permanently-unparseable row does not sit
      // claimed forever; this should never happen for a gate this build's
      // own propose.ts opened (it always stamps a valid ResumeContext).
      await claim.ack();
      continue;
    }
    const resumeCtx = parsedCtx.data;
    const record = deps.loadRecord(resumeCtx.recordPath);

    let action: Action;
    if (gate.status === "approved") {
      const outcome = await executeApprovedAction(resumeCtx, draftFromPresentation(gate), {
        sluice: deps.sluice,
        githubTransport: deps.githubTransport,
      });
      action = outcomeToAction(gate.id, resumeCtx, outcome);
    } else if (gate.status === "rejected" || gate.status === "cancelled") {
      action = refusedActionFor(gate.id, resumeCtx, "rejected");
    } else {
      // "timed_out" — the only other terminal status claimDecided ever
      // hands back (SPEC §9: fail closed).
      action = refusedActionFor(gate.id, resumeCtx, "gate_timed_out");
    }

    const refusals: Refusal[] =
      action.status === "refused" && action.reasonCode !== undefined
        ? [{ subject: action.id, reasonCode: action.reasonCode, detail: `gate ${gate.id} resolved "${gate.status}"` }]
        : [];

    const newEvents = (await deps.sluice.audit.since({ namespace: gate.namespace, seq: record.audit.toSeq }, 10_000)).map(
      toAuditEventRecord
    );

    const amended = appendAmendment(record, {
      at: new Date(deps.now()).toISOString(),
      by: "dogwatch:resume",
      kind: "gate_resolved",
      events: newEvents,
      actions: [action],
      gates: [toGateEntry(gate)],
      refusals,
    });
    deps.saveRecord(resumeCtx.recordPath, amended);

    // Close the tokenless self-repo notification issue with the outcome
    // (SPEC §5 step 5) — found by the SAME hidden marker propose.ts stamped
    // when it opened it.
    const notifyMarker = `<!-- dogwatch:gate:${gate.id} -->`;
    const notifyIssue = await deps.githubTransport.findIssueByMarker(DOGWATCH_SELF_REPO, notifyMarker);
    if (notifyIssue !== null) {
      await deps.githubTransport.closeIssue({
        repo: DOGWATCH_SELF_REPO,
        issueNumber: notifyIssue.number,
        comment: `Resolved via ${gate.decidedBy ?? "unknown channel"}: ${summaryLineFor(action)}`,
      });
    }

    await claim.ack();
    results.push({ gateId: gate.id, recordPath: resumeCtx.recordPath, outcome: action.status });
  }

  return { sweptTimeouts, claimed: claims.length, results };
}
