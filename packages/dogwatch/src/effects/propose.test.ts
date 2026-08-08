import { createSluice, MemoryStore } from "@jamessuuu/sluice";
import { describe, expect, it } from "vitest";
import { proposeAndGateFindings, DOGWATCH_SELF_REPO, type ProposeContext } from "./propose.js";
import { FakeGithubTransport } from "./github-transport.js";
import { makeCheck, makeFinding } from "../record/test-helper.js";
import type { TargetsFile } from "../record/targets-schema.js";

const targets: TargetsFile = {
  formatVersion: 1,
  sites: [
    {
      id: "agentjames",
      name: "Agent James",
      url: "https://agentjames.vercel.app",
      repo: "jamessuuu/agentjames",
      deployed: true,
      families: ["reach"],
      expectedHeaders: [],
      weightBudgetBytes: 300_000,
    },
  ],
  repos: [],
  packages: [],
  artifacts: [],
  actionPolicy: { issueRepos: ["jamessuuu/agentjames"], confirmations: 2, gateTimeoutHours: 48 },
};

function baseCtx(overrides?: Partial<ProposeContext>): ProposeContext {
  const store = new MemoryStore();
  const sluice = createSluice({ store, namespace: "test", owner: "test-owner", approvalSecret: "s3cr3t" });
  return {
    sluice,
    // Pinned id (not makeCheck's own auto-incrementing counter, which is
    // shared module-wide across every test file that imports test-helper.ts
    // — relying on it here would make this test order-dependent) so it
    // matches confirmedFinding.checkId below exactly, every time.
    checks: [makeCheck({ id: "reach:agentjames:reach.status_not_200:1", targetId: "agentjames", ruleId: "reach.status_not_200" })],
    actionPolicy: targets.actionPolicy,
    targets,
    storeKind: "postgres",
    runId: "run-1",
    startedAt: "2026-08-09T15:00:00.000Z",
    now: () => Date.parse("2026-08-09T15:00:00.000Z"),
    githubTransport: new FakeGithubTransport(),
    gatePageBaseUrl: "https://dogwatch.vercel.app/gate",
    ...overrides,
  };
}

const confirmedFinding = makeFinding({
  status: "confirmed",
  checkId: "reach:agentjames:reach.status_not_200:1",
  fingerprint: "fp-1",
});

describe("proposeAndGateFindings", () => {
  it("opens exactly one gate + one self-repo notification issue for a confirmed, in-policy finding", async () => {
    const transport = new FakeGithubTransport();
    const ctx = baseCtx({ githubTransport: transport });
    const result = await proposeAndGateFindings([confirmedFinding], ctx);

    expect(result.gates).toHaveLength(1);
    expect(result.gates[0]?.status).toBe("pending");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.status).toBe("gated_pending");
    expect(result.actions[0]?.gateId).toBe(result.gates[0]?.id);
    expect(result.refusals).toHaveLength(0);

    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("test setup: no gate opened");
    const notified = transport.issuesOpened(DOGWATCH_SELF_REPO);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.body).toContain(`<!-- dogwatch:gate:${gateId} -->`);
    expect(notified[0]?.body).toContain(`/gate?id=${gateId}`);
    expect(notified[0]?.body).not.toMatch(/[?&]t=/); // no token in the public issue
  });

  it("is idempotent on the finding fingerprint: proposing the same finding twice opens only one gate", async () => {
    const transport = new FakeGithubTransport();
    const ctx = baseCtx({ githubTransport: transport });
    const first = await proposeAndGateFindings([confirmedFinding], ctx);
    const second = await proposeAndGateFindings([confirmedFinding], ctx);
    expect(second.gates[0]?.id).toBe(first.gates[0]?.id);
    // The notification issue IS re-sent (informational, not the governed
    // effect — see propose.ts's header comment) but the GATE itself is the
    // same durable row both times.
    expect(await ctx.sluice.gates.pending()).toHaveLength(1);
  });

  it("SPEC S9 recurring finding: once a gate is decided, a later proposal of the SAME finding publishes duplicate_suppressed instead of re-notifying", async () => {
    const transport = new FakeGithubTransport();
    const ctx = baseCtx({ githubTransport: transport });
    const first = await proposeAndGateFindings([confirmedFinding], ctx);
    const gateId = first.gates[0]?.id;
    if (gateId === undefined) throw new Error("test setup: no gate opened");
    await ctx.sluice.gates.decide({ id: gateId, decision: "approve", decidedBy: "test-human" });

    const notifiedBefore = transport.issuesOpened(DOGWATCH_SELF_REPO).length;
    const second = await proposeAndGateFindings([confirmedFinding], ctx);

    expect(second.gates).toHaveLength(0); // nothing NEW to publish about the gate
    expect(second.actions).toHaveLength(1);
    expect(second.actions[0]?.status).toBe("refused");
    expect(second.actions[0]?.reasonCode).toBe("duplicate_suppressed");
    expect(second.refusals[0]?.reasonCode).toBe("duplicate_suppressed");
    expect(second.refusals[0]?.detail).toContain(confirmedFinding.firstSeenRunId);
    // No fresh self-repo notification — the human already decided.
    expect(transport.issuesOpened(DOGWATCH_SELF_REPO)).toHaveLength(notifiedBefore);
  });

  it("skips an unconfirmed finding entirely — no action, no gate, no refusal", async () => {
    const ctx = baseCtx();
    const result = await proposeAndGateFindings(
      [makeFinding({ status: "unconfirmed", checkId: "reach:agentjames:reach.status_not_200:1" })],
      ctx
    );
    expect(result.actions).toHaveLength(0);
    expect(result.gates).toHaveLength(0);
    expect(result.refusals).toHaveLength(0);
  });

  it("skips a finding whose target repo is outside actionPolicy.issueRepos", async () => {
    const ctx = baseCtx({
      targets: { ...targets, actionPolicy: { ...targets.actionPolicy, issueRepos: ["jamessuuu/dogwatch"] } },
      actionPolicy: { ...targets.actionPolicy, issueRepos: ["jamessuuu/dogwatch"] },
    });
    const result = await proposeAndGateFindings([confirmedFinding], ctx);
    expect(result.actions).toHaveLength(0);
    expect(result.gates).toHaveLength(0);
  });

  it("M4/M5 crossover — storeKind !== 'postgres' refuses instead of opening a gate (SPEC S9 store_unavailable, fail closed)", async () => {
    const ctx = baseCtx({ storeKind: "memory" });
    const result = await proposeAndGateFindings([confirmedFinding], ctx);
    expect(result.gates).toHaveLength(0);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.status).toBe("refused");
    expect(result.actions[0]?.reasonCode).toBe("store_unavailable");
    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]?.reasonCode).toBe("store_unavailable");
    expect(result.refusals[0]?.subject).toBe(confirmedFinding.id);
  });

  it("mints and sends a tokenized webhook notification only when both notifyWebhookUrl and approvalSecret are configured", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      // sendWebhookNotification always sends a JSON.stringify'd body — safe
      // to assert as string rather than reach for a lossy String(x).
      calls.push({ url, body: init?.body as string });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    const ctx = baseCtx({ notifyWebhookUrl: "https://ntfy.example.com/hook", approvalSecret: "s3cr3t", webhookFetchImpl: fetchImpl });
    await proposeAndGateFindings([confirmedFinding], ctx);
    expect(calls).toHaveLength(1);
    const parsed = JSON.parse(calls[0]?.body ?? "{}") as { url: string };
    expect(parsed.url).toMatch(/[?&]t=/);
  });

  it("never calls the webhook when notifyWebhookUrl is configured but approvalSecret is not", async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;
    const store = new MemoryStore();
    const sluiceNoSecret = createSluice({ store, namespace: "test", owner: "test-owner" }); // no approvalSecret
    const ctx = baseCtx({
      sluice: sluiceNoSecret,
      notifyWebhookUrl: "https://ntfy.example.com/hook",
      webhookFetchImpl: fetchImpl,
    });
    await proposeAndGateFindings([confirmedFinding], ctx);
    expect(called).toBe(false);
  });
});
