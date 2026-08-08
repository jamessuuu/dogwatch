/**
 * The SPEC §11.4 scenario suite — every scenario runs on sluice `MemoryStore`
 * with `FakeGithubTransport` (HARD RULE: no real GitHub API call in tests,
 * fake transport only) and asserts against the transport's own ledger for
 * "exactly one issue", never against a mocked HTTP call count. This is the
 * gate kernel's own end-to-end proof — propose → decide (via `decide.ts`,
 * the one function every real decision channel calls) → resume (execute →
 * amend → close notification) — independent of `record/build-run.ts`'s
 * wiring (covered separately by `build-run.test.ts`'s M4/M5 tests).
 */
import { createSluice, MemoryStore, type SluiceError } from "@jamessuuu/sluice";
import { describe, expect, it } from "vitest";
import { decideGate } from "./decide.js";
import { executeApprovedAction } from "./execute.js";
import { FakeGithubTransport } from "./github-transport.js";
import { DOGWATCH_SELF_REPO, proposeAndGateFindings, type ProposeContext } from "./propose.js";
import { runResume, type ResumeDeps } from "./resume.js";
import { makeCheck, makeFinding } from "../record/test-helper.js";
import type { RunRecord } from "../record/schema.js";
import { makeMinimalRecord } from "../record/test-helper.js";
import type { TargetsFile } from "../record/targets-schema.js";

const TARGET_REPO = "jamessuuu/agentjames";

const targets: TargetsFile = {
  formatVersion: 1,
  sites: [
    {
      id: "agentjames",
      name: "Agent James",
      url: "https://agentjames.vercel.app",
      repo: TARGET_REPO,
      deployed: true,
      families: ["reach"],
      expectedHeaders: [],
      weightBudgetBytes: 300_000,
    },
  ],
  repos: [],
  packages: [],
  artifacts: [],
  actionPolicy: { issueRepos: [TARGET_REPO], confirmations: 2, gateTimeoutHours: 48 },
};

const CHECK_ID = "reach:agentjames:reach.status_not_200:1";
const NOW_MS = Date.parse("2026-08-09T15:00:00.000Z");

function confirmedFinding(overrides?: Partial<ReturnType<typeof makeFinding>>) {
  return makeFinding({ status: "confirmed", checkId: CHECK_ID, fingerprint: "fp-scenario", ...overrides });
}

/** A minimal harness wiring every piece the scenario suite needs, backed by
 * an in-memory record "filesystem" (a Map) instead of real fs — the exact
 * seam `cli/resume.ts` fills with real file I/O in production. */
function harness(o?: { approvalSecret?: string }) {
  const store = new MemoryStore();
  const sluice = createSluice({
    store,
    namespace: "scenario",
    owner: "scenario-owner",
    ...(o?.approvalSecret === undefined ? {} : { approvalSecret: o.approvalSecret }),
  });
  const transport = new FakeGithubTransport();
  const records = new Map<string, RunRecord>();

  const check = makeCheck({ id: CHECK_ID, targetId: "agentjames", ruleId: "reach.status_not_200" });
  const proposeCtx: ProposeContext = {
    sluice,
    checks: [check],
    actionPolicy: targets.actionPolicy,
    targets,
    storeKind: "postgres",
    runId: "run-1",
    startedAt: "2026-08-09T15:00:00.000Z",
    now: () => NOW_MS,
    githubTransport: transport,
    gatePageBaseUrl: "https://dogwatch.vercel.app/gate",
  };

  const resumeDeps: ResumeDeps = {
    sluice,
    githubTransport: transport,
    loadRecord: (path) => {
      const r = records.get(path);
      if (r === undefined) throw new Error(`no in-memory record at ${path}`);
      return r;
    },
    saveRecord: (path, record) => {
      records.set(path, record);
    },
    now: () => NOW_MS,
  };

  async function propose(finding = confirmedFinding()) {
    const result = await proposeAndGateFindings([finding], proposeCtx);
    const recordPath = "runs/2026/2026-08-09-run-1.json";
    const base = makeMinimalRecord({
      runId: "run-1",
      startedAt: "2026-08-09T15:00:00.000Z",
      endedAt: "2026-08-09T15:00:01.000Z",
      checks: [check],
      findings: [finding],
      actions: result.actions,
      gates: result.gates,
      refusals: result.refusals,
      audit: {
        namespace: "scenario",
        store: "postgres",
        fromSeq: 0,
        toSeq: 0,
        prevHead: null,
        head: null,
        verified: true,
        events: [],
      },
    });
    records.set(recordPath, base);
    return { result, recordPath, finding };
  }

  return { sluice, transport, records, proposeCtx, resumeDeps, propose };
}

describe("SPEC §11.4 scenario suite (MemoryStore, FakeGithubTransport)", () => {
  it("1. open -> approve -> execute: exactly ONE issue via the fake transport ledger", async () => {
    const h = harness();
    const { result } = await h.propose();
    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("scenario setup: no gate opened");

    await decideGate({ sluice: h.sluice, gateId, decision: "approve", channel: "workflow_dispatch", actor: "octocat" });
    const summary = await runResume(h.resumeDeps);

    expect(summary.claimed).toBe(1);
    expect(summary.results[0]?.outcome).toBe("executed");
    expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(1);

    const amended = h.records.get("runs/2026/2026-08-09-run-1.json");
    const amendment = amended?.amendments[0];
    expect(amendment?.actions[0]?.status).toBe("executed");
    expect(amendment?.gates[0]?.status).toBe("approved");
    expect(amendment?.gates[0]?.decisionChannel).toBe("workflow_dispatch");

    // The tokenless self-repo notification issue was closed with the outcome.
    const notified = h.transport.issuesOpened(DOGWATCH_SELF_REPO);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.closed).toBe(true);
  });

  it("2. duplicate poller: two concurrent resume() calls after approval still produce exactly ONE issue", async () => {
    const h = harness();
    const { result } = await h.propose();
    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("scenario setup: no gate opened");
    await decideGate({ sluice: h.sluice, gateId, decision: "approve", channel: "cli", actor: "james" });

    const [a, b] = await Promise.all([runResume(h.resumeDeps), runResume(h.resumeDeps)]);
    const totalClaimed = a.claimed + b.claimed;
    expect(totalClaimed).toBe(1); // sluice's own claim lease makes the second poller's claimDecided return empty
    expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(1);
  });

  it("3. crash mid-execute (effect succeeds, process dies before ack) then resume: still ONE issue", async () => {
    const h = harness();
    const { result, recordPath } = await h.propose();
    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("scenario setup: no gate opened");
    await decideGate({ sluice: h.sluice, gateId, decision: "approve", channel: "cli", actor: "james" });

    // Attempt 1: claim with a short lease, execute the REAL effect (it
    // succeeds — sluice durably records it), then simulate a crash by
    // never calling claim.ack() or writing the amendment.
    const [firstClaim] = await h.sluice.gates.claimDecided({ leaseMs: 20 });
    if (firstClaim === undefined) throw new Error("scenario setup: claimDecided returned nothing");
    const resumeCtxResult = await import("./resume-context.js").then((m) => m.ResumeContextSchema.parse(firstClaim.gate.resumeContext));
    await executeApprovedAction(resumeCtxResult, { title: "t", body: "b" }, { sluice: h.sluice, githubTransport: h.transport });
    // No ack() — the process "crashed" here.

    // Let the short lease actually expire (real wall-clock time; leaseMs
    // was set to 20ms specifically so this stays fast).
    await new Promise((r) => setTimeout(r, 60));

    // Attempt 2: a fresh resume() reclaims the now-expired claim and
    // re-executes — sluice replays the ALREADY-succeeded effect instead of
    // calling the transport again.
    const before = h.transport.issuesOpened(TARGET_REPO).length;
    const summary = await runResume(h.resumeDeps);
    expect(summary.claimed).toBe(1);
    expect(summary.results[0]?.outcome).toBe("executed");
    expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(before); // no NEW issue on the replay
    expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(1);
    expect(h.records.get(recordPath)?.amendments).toHaveLength(1); // attempt 1 never wrote one
  });

  it("4. reject -> refusal recorded, no effect ever attempted", async () => {
    const h = harness();
    const { result } = await h.propose();
    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("scenario setup: no gate opened");

    await decideGate({ sluice: h.sluice, gateId, decision: "reject", channel: "workflow_dispatch", actor: "octocat", reason: "false positive" });
    const summary = await runResume(h.resumeDeps);

    expect(summary.results[0]?.outcome).toBe("refused");
    expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(0);
    const amendment = h.records.get("runs/2026/2026-08-09-run-1.json")?.amendments[0];
    expect(amendment?.refusals[0]?.reasonCode).toBe("rejected");
    expect(amendment?.actions[0]?.reasonCode).toBe("rejected");
  });

  it("5. timeout -> fail closed: no decision ever made, sweepTimeouts resolves it to timed_out/refused, no effect attempted", async () => {
    const store = new MemoryStore();
    let virtualNow = NOW_MS;
    const sluice = createSluice({ store, namespace: "scenario", owner: "scenario-owner", clock: { now: () => virtualNow, sleep: () => Promise.resolve() } });
    const transport = new FakeGithubTransport();
    const check = makeCheck({ id: CHECK_ID, targetId: "agentjames", ruleId: "reach.status_not_200" });
    const finding = confirmedFinding();
    const proposeCtx: ProposeContext = {
      sluice,
      checks: [check],
      actionPolicy: { ...targets.actionPolicy, gateTimeoutHours: 1 }, // short timeout for the test
      targets: { ...targets, actionPolicy: { ...targets.actionPolicy, gateTimeoutHours: 1 } },
      storeKind: "postgres",
      runId: "run-1",
      startedAt: "2026-08-09T15:00:00.000Z",
      now: () => virtualNow,
      githubTransport: transport,
      gatePageBaseUrl: "https://dogwatch.vercel.app/gate",
    };
    const result = await proposeAndGateFindings([finding], proposeCtx);
    expect(result.gates[0]?.status).toBe("pending");

    // Advance the virtual clock past the 1-hour gate timeout — no decision
    // was ever made through any channel.
    virtualNow += 2 * 60 * 60 * 1000;

    const records = new Map<string, RunRecord>();
    const recordPath = "runs/2026/2026-08-09-run-1.json";
    records.set(
      recordPath,
      makeMinimalRecord({
        runId: "run-1",
        checks: [check],
        findings: [finding],
        actions: result.actions,
        gates: result.gates,
        refusals: result.refusals,
        audit: { namespace: "scenario", store: "postgres", fromSeq: 0, toSeq: 0, prevHead: null, head: null, verified: true, events: [] },
      })
    );
    const resumeDeps: ResumeDeps = {
      sluice,
      githubTransport: transport,
      loadRecord: (p) => {
        const r = records.get(p);
        if (r === undefined) throw new Error("missing record");
        return r;
      },
      saveRecord: (p, r) => records.set(p, r),
      now: () => virtualNow,
    };

    const summary = await runResume(resumeDeps);
    expect(summary.sweptTimeouts).toBe(1);
    expect(summary.results[0]?.outcome).toBe("refused");
    const amendment = records.get(recordPath)?.amendments[0];
    expect(amendment?.gates[0]?.status).toBe("timed_out");
    expect(amendment?.actions[0]?.reasonCode).toBe("gate_timed_out");
    expect(transport.issuesOpened(TARGET_REPO)).toHaveLength(0); // no auto-approve, no effect ever attempted
  });

  it("6. decision race: two concurrent decisions on the same gate -> first writer wins, both attempts observable, exactly one outcome persists", async () => {
    const h = harness();
    const { result } = await h.propose();
    const gateId = result.gates[0]?.id;
    if (gateId === undefined) throw new Error("scenario setup: no gate opened");

    const [approveResult, rejectResult] = await Promise.all([
      decideGate({ sluice: h.sluice, gateId, decision: "approve", channel: "cli", actor: "a" }),
      decideGate({ sluice: h.sluice, gateId, decision: "reject", channel: "cli", actor: "b" }),
    ]);
    // Both calls resolve (F6: the loser is idempotent, not an error) and
    // BOTH return the SAME recorded status — the one that actually won.
    expect(approveResult.status).toBe(rejectResult.status);
    expect(["approved", "rejected"]).toContain(approveResult.status);

    const finalGate = await h.sluice.gates.get(gateId);
    expect(finalGate?.status).toBe(approveResult.status);

    const summary = await runResume(h.resumeDeps);
    // Exactly one outcome persisted — never a mix of both.
    expect(summary.results).toHaveLength(1);
    if (approveResult.status === "approved") {
      expect(summary.results[0]?.outcome).toBe("executed");
      expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(1);
    } else {
      expect(summary.results[0]?.outcome).toBe("refused");
      expect(h.transport.issuesOpened(TARGET_REPO)).toHaveLength(0);
    }
  });

  it("7. token replay -> E_BAD_TOKEN (expired token; and a token minted for a different gate)", async () => {
    const h = harness({ approvalSecret: "s3cr3t" });
    const { result } = await h.propose(confirmedFinding({ fingerprint: "fp-a" }));
    const gateIdA = result.gates[0]?.id;
    if (gateIdA === undefined) throw new Error("scenario setup: no gate opened");

    // A short-lived token, allowed to expire before it is ever presented —
    // SPEC §9: "48h expiry... E_BAD_TOKEN otherwise."
    const expiredToken = h.sluice.gates.mintToken(gateIdA, { ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 15));
    await expect(
      decideGate({ sluice: h.sluice, gateId: gateIdA, decision: "approve", channel: "token", token: expiredToken })
    ).rejects.toMatchObject({ code: "E_BAD_TOKEN" } satisfies Partial<SluiceError>);

    // A stolen-shaped replay: a VALID token minted for a DIFFERENT gate,
    // presented against this one.
    const { result: resultB } = await h.propose(confirmedFinding({ fingerprint: "fp-b" }));
    const gateIdB = resultB.gates[0]?.id;
    if (gateIdB === undefined) throw new Error("scenario setup: no second gate opened");
    const tokenForB = h.sluice.gates.mintToken(gateIdB, { ttlMs: 60_000 });
    await expect(
      decideGate({ sluice: h.sluice, gateId: gateIdA, decision: "approve", channel: "token", token: tokenForB })
    ).rejects.toMatchObject({ code: "E_BAD_TOKEN" } satisfies Partial<SluiceError>);

    // Gate A was never actually decided by either bad attempt.
    const gateA = await h.sluice.gates.get(gateIdA);
    expect(gateA?.status).toBe("pending");
  });

  it("no auto-approve path exists anywhere: every gate this suite opens defaults onTimeout to 'reject' (SPEC S9)", async () => {
    const h = harness();
    const { result } = await h.propose();
    // sluice's own default (SPEC F12) — propose.ts never overrides it to
    // 'approve', and nothing in src/effects ever passes onTimeout:'approve'.
    const gate = await h.sluice.gates.get(result.gates[0]?.id ?? "");
    expect(gate?.onTimeout).toBe("reject");
  });
});
