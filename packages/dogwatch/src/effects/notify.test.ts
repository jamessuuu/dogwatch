import { describe, expect, it } from "vitest";
import { composeGateNotificationIssue, composeWebhookPayload, type PublicGateSummary } from "./notify.js";

const summary: PublicGateSummary = {
  gateId: "gate-1",
  runId: "run-1",
  recordPath: "runs/2026/2026-08-09-run-1.json",
  findingId: "F-abc123",
  ruleId: "reach.status_not_200",
  severity: "high",
  statement: "GET https://agentjames.vercel.app → 503 at 2026-08-09T15:00:00.000Z",
  actionKind: "issue.open",
  target: "jamessuuu/agentjames",
  draftTitle: "agentjames is returning 503",
  draftBody: "The homepage has been returning 503 since the last run.",
  expiresAt: "2026-08-11T15:00:00.000Z",
  gatePageUrl: "https://dogwatch.vercel.app/gate?id=gate-1",
};

describe("PublicGateSummary — token cannot reach a public issue by construction (type level)", () => {
  it("composeGateNotificationIssue accepts a well-formed summary and renders no token-shaped text", () => {
    const { title, body } = composeGateNotificationIssue(summary);
    expect(title).toContain("agentjames is returning 503");
    expect(body).toContain("<!-- dogwatch:gate:gate-1 -->");
    expect(body).toContain(summary.gatePageUrl);
    // Defense in depth alongside the compile-time guarantee below: no
    // querystring token parameter appears anywhere in the composed text.
    expect(body).not.toMatch(/[?&]t=/);
    expect(title).not.toMatch(/[?&]t=/);
  });

  it("rejects an object literal carrying a token/t field at the call site (TS excess-property check)", () => {
    // @ts-expect-error PublicGateSummary has no token field — this is the
    // enforcement itself, not a demonstration of it. If a future edit ever
    // adds `token`/`t` to PublicGateSummary, this line's expected error
    // disappears and `pnpm typecheck` fails on this file, catching the
    // regression before any public artifact could carry a token.
    composeGateNotificationIssue({ ...summary, token: "super-secret-approval-token" });
    expect(true).toBe(true); // unreachable at runtime under a correct build; keeps this a real `it`
  });

  it("composeWebhookPayload (the ONLY token-bearing composer) is a structurally different type — never accepted by composeGateNotificationIssue", () => {
    const payload = composeWebhookPayload({
      gateId: summary.gateId,
      runId: summary.runId,
      findingId: summary.findingId,
      severity: summary.severity,
      statement: summary.statement,
      expiresAt: summary.expiresAt,
      gatePageUrlWithToken: "https://dogwatch.vercel.app/gate?id=gate-1&t=abc.def.ghi",
    });
    expect(payload.url).toContain("&t=");
    // Type-only assertion — deliberately never invoked (a webhook-shaped
    // payload is missing recordPath/actionKind/target/draftTitle/draftBody/
    // gatePageUrl, so calling this for real would throw; the point is that
    // it does not even TYPECHECK, which `tsc` still verifies for an
    // unreachable function body).
    function typeOnlyAssertion(): void {
      // @ts-expect-error WebhookGateNotification is not a PublicGateSummary
      // — the two types are not interchangeable, which is what stops a
      // webhook-shaped value from being handed to the public composer even
      // by accident.
      composeGateNotificationIssue(payload);
    }
    void typeOnlyAssertion;
  });
});
