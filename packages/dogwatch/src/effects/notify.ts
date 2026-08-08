/**
 * Gate notification composers (SPEC §4/§5, M5): "the notification composer
 * for public artifacts takes a `PublicGateSummary` that has NO token field,
 * so a token cannot reach a public issue by construction." This is enforced
 * at the TYPE level, not by convention or a runtime redaction pass:
 *
 *   1. `PublicGateSummary` below declares no `token`/`t` property anywhere
 *      in its shape. There is nowhere for a token to be stored on a value
 *      of this type.
 *   2. `composePublicGateIssue` — the ONLY function permitted to build text
 *      for dogwatch's own public repo issue — accepts nothing BUT a
 *      `PublicGateSummary`. It cannot read a token from its argument
 *      because the argument's TYPE has none, regardless of what the caller
 *      might have in scope.
 *   3. Because `PublicGateSummary` is a closed (`strictObject`-shaped, via
 *      plain TS `interface` + no index signature) type, passing an object
 *      LITERAL with an extra `token`/`t` property directly into
 *      `composePublicGateIssue(...)` fails TypeScript's excess-property
 *      check at the call site — not at some later point where the mistake
 *      is hard to trace. `notify.test.ts` pins this with a
 *      `// @ts-expect-error` case: if a future edit ever widens
 *      `PublicGateSummary` to admit a token-shaped field, that test's
 *      expected compile error disappears and CI's typecheck stage fails.
 *
 * The token DOES exist, but only inside `WebhookGateNotification` (below) —
 * a structurally distinct type consumed by exactly one call site
 * (`sendWebhookNotification`, the optional `NOTIFY_WEBHOOK_URL` path),
 * which is never used to build repo-issue text.
 */
import type { ActionKind, Severity } from "../record/schema.js";

export interface PublicGateSummary {
  gateId: string;
  runId: string;
  recordPath: string;
  findingId: string;
  ruleId: string;
  severity: Severity;
  statement: string;
  actionKind: ActionKind;
  target: string;
  draftTitle: string;
  draftBody: string;
  expiresAt: string;
  /** Tokenless — `?id=<gateId>` only (SPEC §5 step 3: "a link to
   * /gate?id=… — no token"). */
  gatePageUrl: string;
}

/**
 * The self-repo issue (SPEC §5 step 3, always created, ungated L2 — a
 * self-repo write). Marked with a hidden comment carrying the gate id, so
 * `dogwatch resume` can find and close this exact issue after the decision
 * lands (a different marker from the reconciliation one in execute.ts,
 * scoped to a DIFFERENT repo — dogwatch's own, never the target repo).
 */
export function composeGateNotificationIssue(summary: PublicGateSummary): { title: string; body: string } {
  const title = `[gate] ${summary.draftTitle}`;
  const body = [
    `A finding proposes an action that needs your approval — the gate expires ${summary.expiresAt}.`,
    "",
    `- Finding: \`${summary.findingId}\` (${summary.ruleId}, ${summary.severity})`,
    `- ${summary.statement}`,
    `- Proposed: \`${summary.actionKind}\` → ${summary.target}`,
    `- Run record: ${summary.recordPath} (run \`${summary.runId}\`)`,
    "",
    `**Decide:** ${summary.gatePageUrl}`,
    "",
    "Also decidable via `workflow_dispatch` on `resume.yml` (GitHub mobile-friendly, no token needed) " +
      "or `dogwatch gate decide` locally.",
    "",
    "---",
    "",
    "Proposed issue draft:",
    "",
    `> **${summary.draftTitle}**`,
    "> ",
    ...summary.draftBody.split("\n").map((line) => `> ${line}`),
    "",
    `<!-- dogwatch:gate:${summary.gateId} -->`,
  ].join("\n");
  return { title, body };
}

export interface WebhookGateNotification {
  gateId: string;
  runId: string;
  findingId: string;
  severity: Severity;
  statement: string;
  expiresAt: string;
  /** WITH the single-use token (`gates.mintToken`) — SPEC §5 step 3's
   * "optional... POST to NOTIFY_WEBHOOK_URL carrying the tokenized link". */
  gatePageUrlWithToken: string;
}

export function composeWebhookPayload(n: WebhookGateNotification): Record<string, unknown> {
  return {
    text: `dogwatch gate ${n.gateId}: ${n.statement} (severity ${n.severity}) — decide by ${n.expiresAt}`,
    gateId: n.gateId,
    runId: n.runId,
    findingId: n.findingId,
    severity: n.severity,
    url: n.gatePageUrlWithToken,
  };
}

export interface SendWebhookOptions {
  webhookUrl: string;
  fetchImpl?: typeof fetch;
}

/** The ONLY call site that ever sees a minted token — never imported by
 * `composeGateNotificationIssue` or anything that touches the dogwatch repo. */
export async function sendWebhookNotification(n: WebhookGateNotification, opts: SendWebhookOptions): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(opts.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(composeWebhookPayload(n)),
  });
  if (!res.ok) {
    throw new Error(`webhook notification failed: ${String(res.status)}`);
  }
}
