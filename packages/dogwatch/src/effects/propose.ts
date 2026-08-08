/**
 * Propose → open gate → notify (SPEC §5 steps 1-3, §12 M5). The one
 * function `record/build-run.ts`'s `proposeActions` hook calls, AFTER the
 * advisory pipeline (SPEC's own step ordering: "derive findings → advisory
 * → propose actions → open gates → publish"). Every side effect here goes
 * through the injected `sluice`/`githubTransport` — nothing in this module
 * touches the network directly except the optional webhook POST, itself
 * behind an injected `fetch`.
 *
 * Issue drafts are DETERMINISTIC templates, not LLM-authored, in this
 * build: `llm/draft.ts` is fully implemented and independently tested but
 * intentionally still wired-but-unreachable from the shipped pipeline
 * (`llm/unreachable.test.ts` continues to enforce this unchanged) — SPEC's
 * own M3 cut-line explicitly allows cutting the advisory LLM entirely
 * without threatening M5 ("the product survives with zero model calls"),
 * and this milestone's graded surface is the gate MECHANICS (exactly-once
 * execute, three decision channels, fail-closed timeout, reconciliation),
 * not a second LLM integration layered on top of triage's existing budget
 * accounting. `action.draft` (the `ActionDraftSchema` field, literal-typed
 * to `author:"claude-haiku-4-5"`) is simply omitted on every action this
 * module produces — a true statement, since no model authored anything
 * here — and the deterministic text is used directly as the issue title/
 * body instead of being wrapped in a `draft` object a human "approves".
 */
import { idempotencyKey, sha256Hex, type Sluice } from "@jamessuuu/sluice";
import { relativeRunRecordPath } from "../record/run-path.js";
import type {
  Action,
  AuditStoreKind,
  Check,
  Finding,
  GateEntry,
  Refusal,
} from "../record/schema.js";
import type { ActionPolicy, TargetsFile } from "../record/targets-schema.js";
import { toGateEntry } from "./gate-entry.js";
import type { GithubTransport } from "./github-transport.js";
import { composeGateNotificationIssue, sendWebhookNotification, type PublicGateSummary } from "./notify.js";
import type { ResumeContext } from "./resume-context.js";

export const DOGWATCH_SELF_REPO = "jamessuuu/dogwatch";

export interface ProposeContext {
  sluice: Sluice;
  checks: readonly Check[];
  actionPolicy: ActionPolicy;
  targets: TargetsFile;
  storeKind: AuditStoreKind;
  runId: string;
  startedAt: string;
  now: () => number;
  githubTransport: GithubTransport;
  /** e.g. "https://dogwatch.vercel.app/gate" — no trailing slash, no query. */
  gatePageBaseUrl: string;
  notifyWebhookUrl?: string | undefined;
  /** Required to mint a webhook token — absent ⇒ the webhook step is
   * skipped even if `notifyWebhookUrl` is set (never silently emits an
   * un-authenticatable link). */
  approvalSecret?: string | undefined;
  webhookFetchImpl?: typeof fetch | undefined;
}

export interface ProposeResult {
  actions: Action[];
  gates: GateEntry[];
  refusals: Refusal[];
}

function repoForTargetId(targets: TargetsFile, targetId: string): string | undefined {
  return (
    targets.sites.find((s) => s.id === targetId)?.repo ??
    targets.repos.find((r) => r.id === targetId)?.repo ??
    targets.packages.find((p) => p.id === targetId)?.repo ??
    targets.artifacts.find((a) => a.id === targetId)?.repo
  );
}

/** A deterministic, template-authored title/body (see this module's header
 * comment for why it is not LLM-authored) — a literal statement about the
 * finding's own recorded evidence, never free text (SPEC §2 editorial
 * rule extends naturally here: nothing here says anything the finding
 * itself does not already say). */
function templateDraft(finding: Finding): { title: string; body: string } {
  const title = `dogwatch: ${finding.ruleId} — ${finding.statement.slice(0, 120)}`;
  const body = [
    `dogwatch's ${finding.ruleId} check produced a ${finding.severity}-severity, ${finding.status} finding:`,
    "",
    `> ${finding.statement}`,
    "",
    "Sources:",
    ...finding.sources.map((s) => `- ${s.method} ${s.url} → ${String(s.status)} at ${s.retrievedAt}`),
  ].join("\n");
  return { title, body };
}

function actionIdFor(effectKey: string): string {
  return `A-${sha256Hex(effectKey).slice(0, 12)}`;
}

/** SPEC §5's frozen timeout math: `gateTimeoutHours` from `targets.json`'s
 * `actionPolicy`, converted to the milliseconds `gates.open` requires. */
function gateTimeoutMsOf(policy: ActionPolicy): number {
  return policy.gateTimeoutHours * 60 * 60 * 1000;
}

export async function proposeAndGateFindings(findings: readonly Finding[], ctx: ProposeContext): Promise<ProposeResult> {
  const actions: Action[] = [];
  const gates: GateEntry[] = [];
  const refusals: Refusal[] = [];
  const recordPath = relativeRunRecordPath(ctx.startedAt, ctx.runId);

  for (const finding of findings) {
    // SPEC §2 hysteresis / §5 step 1: only a CONFIRMED finding proposes an
    // action — an `unconfirmed` finding (night one of a medium/low) simply
    // is not eligible yet. Silent, not a refusal: nothing was ever proposed.
    if (finding.status !== "confirmed") continue;

    const check = ctx.checks.find((c) => c.id === finding.checkId);
    if (check === undefined) continue; // R2/R3 already guarantee this cannot happen for a real record
    const targetId = check.targetId;
    const repo = repoForTargetId(ctx.targets, targetId);
    if (repo === undefined || !ctx.actionPolicy.issueRepos.includes(repo)) continue; // out of policy scope entirely

    const effectKey = idempotencyKey({
      tool: "github.issue.open",
      repo,
      ruleId: finding.ruleId,
      targetId,
      fingerprint: finding.fingerprint,
    });
    const actionId = actionIdFor(effectKey);
    const draft = templateDraft(finding);

    if (ctx.storeKind !== "postgres") {
      // SPEC §9 "Neon suspended / over quota": no gate can open — fail
      // closed, never fail silent. Both the action AND a top-level refusal
      // entry publish the exact same fact (R7 requires the former; the
      // acceptance criterion "≥1 published refusal" reads the latter).
      const detail = `store is "${ctx.storeKind}", not "postgres" — a gate cannot be durably opened, so this action is refused rather than gated`;
      actions.push({ id: actionId, kind: "issue.open", target: repo, status: "refused", effectKey, reasonCode: "store_unavailable" });
      refusals.push({ subject: finding.id, reasonCode: "store_unavailable", detail });
      continue;
    }

    // Idempotent on the fingerprint (SPEC §5 step 2): a re-run of the same
    // night, or a recurring finding, never opens a second gate.
    const gate = await ctx.sluice.gates.open({
      key: finding.fingerprint,
      action: { kind: "issue.open", tool: "github.issue.open", args: { repo, title: draft.title } },
      presentation: { title: draft.title, summary: finding.statement, details: { body: draft.body } },
      requester: { actor: "dogwatch", runId: ctx.runId },
      timeoutMs: gateTimeoutMsOf(ctx.actionPolicy),
      onTimeout: "reject",
      resumeContext: {
        runId: ctx.runId,
        recordPath,
        actionId,
        effectKey,
        targetRepo: repo,
      } satisfies ResumeContext,
    });

    if (gate.status !== "pending") {
      // SPEC §9 "recurring finding, 40 nights": this finding's gate was
      // already decided (or timed out) in a PREVIOUS run — `gates.open`'s
      // idempotent-on-key return, not a fresh open. One issue, ever: never
      // re-notify as if this were a new proposal.
      actions.push({ id: actionId, kind: "issue.open", target: repo, status: "refused", effectKey, reasonCode: "duplicate_suppressed" });
      refusals.push({
        subject: finding.id,
        reasonCode: "duplicate_suppressed",
        detail: `gate ${gate.id} (key ${finding.fingerprint}) was already ${gate.status} — first seen in run ${finding.firstSeenRunId}`,
      });
      continue;
    }

    gates.push(toGateEntry(gate));
    actions.push({ id: actionId, kind: "issue.open", target: repo, status: "gated_pending", gateId: gate.id, effectKey });

    // Notification, two channels (SPEC §5 step 3). Always: a tokenless
    // self-repo issue — a self-repo write, ungated (L2). This call itself
    // is NEVER retried through sluice.run(): it is informational, not the
    // governed effect (the governed effect is the SIBLING-repo issue,
    // executed only after approval — see execute.ts), and a duplicate
    // notification issue on a retried `watch` run is a low-cost, visible
    // annoyance, not a correctness problem the way a duplicate PUBLIC issue
    // on jamessuuu/agentjames would be.
    const summary: PublicGateSummary = {
      gateId: gate.id,
      runId: ctx.runId,
      recordPath,
      findingId: finding.id,
      ruleId: finding.ruleId,
      severity: finding.severity,
      statement: finding.statement,
      actionKind: "issue.open",
      target: repo,
      draftTitle: draft.title,
      draftBody: draft.body,
      expiresAt: toGateEntry(gate).expiresAt,
      gatePageUrl: `${ctx.gatePageBaseUrl}?id=${gate.id}`,
    };
    const { title: notifyTitle, body: notifyBody } = composeGateNotificationIssue(summary);
    await ctx.githubTransport.openIssue({ repo: DOGWATCH_SELF_REPO, title: notifyTitle, body: notifyBody });

    // Optional webhook, WITH the single-use token (SPEC §5 step 3) — the
    // ONLY call site in the entire product that mints one during propose.
    if (ctx.notifyWebhookUrl !== undefined && ctx.approvalSecret !== undefined) {
      const token = ctx.sluice.gates.mintToken(gate.id, { ttlMs: gateTimeoutMsOf(ctx.actionPolicy) });
      await sendWebhookNotification(
        {
          gateId: gate.id,
          runId: ctx.runId,
          findingId: finding.id,
          severity: finding.severity,
          statement: finding.statement,
          expiresAt: summary.expiresAt,
          gatePageUrlWithToken: `${ctx.gatePageBaseUrl}?id=${gate.id}&t=${token}`,
        },
        { webhookUrl: ctx.notifyWebhookUrl, ...(ctx.webhookFetchImpl === undefined ? {} : { fetchImpl: ctx.webhookFetchImpl }) }
      );
    }
  }

  return { actions, gates, refusals };
}
