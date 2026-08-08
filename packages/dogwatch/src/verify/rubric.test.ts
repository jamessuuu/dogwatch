import { describe, expect, it } from "vitest";
import { buildRun } from "../record/build-run.js";
import { createReplayHttpProbe } from "../probe/replay.js";
import { makeCheck, makeFinding, makeMinimalRecord, TEST_PRICING_MANIFEST } from "../record/test-helper.js";
import type { RunRecord } from "../record/schema.js";
import type { TargetsFile } from "../record/targets-schema.js";
import { verifyRecord } from "./rubric.js";

function codesOf(record: RunRecord, opts?: Parameters<typeof verifyRecord>[1]): string[] {
  return verifyRecord(record, opts).map((v) => v.code);
}

const ONE_SITE: TargetsFile = {
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
  actionPolicy: { issueRepos: [], confirmations: 2, gateTimeoutHours: 48 },
};

/** A record that passes every rule on its own — built through the REAL
 * pipeline (replay probe, no network) rather than hand-rolled, so its
 * `audit` block carries a genuine, sluice-verified hash chain instead of
 * an empty stub. The baseline every violation test below mutates exactly
 * one thing away from. */
async function healthyRecord(): Promise<RunRecord> {
  return buildRun({
    targets: ONE_SITE,
    targetsHash: "test-targets-hash",
    probe: createReplayHttpProbe({
      get: {
        "https://agentjames.vercel.app": {
          status: 200,
          finalUrl: "https://agentjames.vercel.app",
          redirects: [],
          headers: {},
          bodyText: "<html></html>",
          bodyTruncated: false,
          bytes: 13,
          ms: 10,
          bodySha256: "0".repeat(64),
        },
      },
    }),
    now: () => Date.parse("2026-08-08T15:00:00.000Z"),
    random: () => 0.5,
    commit: "0".repeat(40),
    watchVersion: "0.0.0-test",
    checkPackVersion: "1",
    pricingManifest: "pricing.2026-08-08.json",
    pricing: TEST_PRICING_MANIFEST,
    kind: "manual",
    scheduledFor: null,
    trigger: { workflow: null, runUrl: null, actor: "test" },
    prevRecord: null,
  });
}

describe("verifyRecord — clean record", () => {
  it("has zero violations", async () => {
    expect(verifyRecord(await healthyRecord())).toEqual([]);
  });
});

describe("R1", () => {
  it("E_NO_CHECKS when checks is empty", () => {
    const record = makeMinimalRecord({ checks: [] });
    expect(codesOf(record)).toContain("E_NO_CHECKS");
  });

  it("E_CHECK_NONTERMINAL when a check is stuck pending", () => {
    const record = makeMinimalRecord({ checks: [makeCheck({ verdict: "pending" })] });
    expect(codesOf(record)).toContain("E_CHECK_NONTERMINAL");
  });
});

describe("R2 / R3", () => {
  it("E_ORPHAN_FINDING when a finding references a non-finding check", () => {
    const check = makeCheck({ id: "chk-1", verdict: "pass" });
    const finding = makeFinding({ checkId: "chk-1" });
    const record = makeMinimalRecord({ checks: [check], findings: [finding] });
    expect(codesOf(record)).toContain("E_ORPHAN_FINDING");
  });

  it("E_UNREPORTED_CHECK when a finding-verdict check has no finding", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding" });
    const record = makeMinimalRecord({ checks: [check], findings: [] });
    expect(codesOf(record)).toContain("E_UNREPORTED_CHECK");
  });
});

describe("R4", () => {
  it("E_UNSOURCED_FINDING when a finding has zero sources", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding" });
    const finding = makeFinding({ checkId: "chk-1", sources: [] });
    const record = makeMinimalRecord({ checks: [check], findings: [finding] });
    expect(codesOf(record)).toContain("E_UNSOURCED_FINDING");
  });

  it("E_UNSOURCED_FINDING when retrievedAt falls outside [startedAt, endedAt]", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding" });
    const finding = makeFinding({
      checkId: "chk-1",
      sources: [
        {
          url: "https://agentjames.vercel.app",
          method: "GET",
          status: 503,
          retrievedAt: "2020-01-01T00:00:00.000Z",
          evidencePath: 'checks[?(@.id=="chk-1")].evidence',
        },
      ],
    });
    const record = makeMinimalRecord({ checks: [check], findings: [finding] });
    expect(codesOf(record)).toContain("E_UNSOURCED_FINDING");
  });

  it("E_UNSOURCED_FINDING when evidencePath does not resolve inside the record", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding" });
    const finding = makeFinding({
      checkId: "chk-1",
      sources: [
        {
          url: "https://agentjames.vercel.app",
          method: "GET",
          status: 503,
          retrievedAt: "2026-08-08T15:00:00.500Z",
          evidencePath: 'checks[?(@.id=="does-not-exist")].evidence',
        },
      ],
    });
    const record = makeMinimalRecord({ checks: [check], findings: [finding] });
    expect(codesOf(record)).toContain("E_UNSOURCED_FINDING");
  });
});

describe("R5", () => {
  it("E_NO_ABSENCE_SECTION when checksClean does not match the real pass count", () => {
    const check = makeCheck({ id: "chk-1", verdict: "pass" });
    const record = makeMinimalRecord({
      checks: [check],
      absenceOfEvidence: { statement: "wrong", checksClean: 99, byFamily: {}, notChecked: [] },
    });
    expect(codesOf(record)).toContain("E_NO_ABSENCE_SECTION");
  });
});

describe("R6", () => {
  it("E_SILENT_SKIP when a skipped check carries no skipReason", () => {
    const withReason = makeCheck({ id: "chk-1", verdict: "skipped", skipReason: "not_published" });
    const { skipReason: _skipReason, ...check } = withReason;
    const record = makeMinimalRecord({ checks: [check] });
    expect(codesOf(record)).toContain("E_SILENT_SKIP");
  });

  it("E_SILENT_SKIP when a skipped check is absent from notChecked", () => {
    const check = makeCheck({ id: "chk-1", verdict: "skipped", skipReason: "not_published" });
    const record = makeMinimalRecord({ checks: [check], absenceOfEvidence: { statement: "x", checksClean: 0, byFamily: {}, notChecked: [] } });
    expect(codesOf(record)).toContain("E_SILENT_SKIP");
  });
});

describe("R7", () => {
  it("E_ACTION_UNBACKED when an executed action is missing gateId/effectKey/effectOutcome", () => {
    const record = makeMinimalRecord({
      actions: [{ id: "act-1", kind: "issue.open", target: "jamessuuu/dogwatch", status: "executed" }],
    });
    expect(codesOf(record)).toContain("E_ACTION_UNBACKED");
  });

  it("E_ACTION_UNBACKED when a refused action carries no reasonCode", () => {
    const record = makeMinimalRecord({
      actions: [{ id: "act-1", kind: "issue.open", target: "jamessuuu/dogwatch", status: "refused" }],
    });
    expect(codesOf(record)).toContain("E_ACTION_UNBACKED");
  });
});

describe("R8", () => {
  it("E_GATE_UNBACKED when a pending gate has no backing gate.opened event", () => {
    const record = makeMinimalRecord({
      gates: [
        {
          id: "gate-1",
          key: "fp-1",
          status: "pending",
          openedAt: "2026-08-08T15:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(codesOf(record)).toContain("E_GATE_UNBACKED");
  });
});

describe("R9", () => {
  it("E_COST_UNBACKED when microUsd does not equal the sum of breakdown", () => {
    const record = makeMinimalRecord({
      cost: { currency: "USD", microUsd: 100, certainty: "reported", breakdown: { probe: 1 }, method: "pricing.json" },
    });
    expect(codesOf(record)).toContain("E_COST_UNBACKED");
  });

  it("E_COST_UNBACKED when llm.calls > 0 but usage tokens are missing and certainty isn't unknown", () => {
    const record = makeMinimalRecord({
      llm: { calls: 1, inputTokens: 0, outputTokens: 0, microUsd: 0, model: "claude-haiku-4-5" },
    });
    expect(codesOf(record)).toContain("E_COST_UNBACKED");
  });
});

describe("R10", () => {
  it("E_ADVISORY_UNGROUNDED when a finding carries an advisory but llm.calls is 0", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding" });
    const finding = makeFinding({
      checkId: "chk-1",
      advisory: { severity: "high", note: "looks bad", model: "claude-haiku-4-5", agreesWithRule: true, proposedAction: "none" },
    });
    const record = makeMinimalRecord({ checks: [check], findings: [finding], llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "no_findings" } });
    expect(codesOf(record)).toContain("E_ADVISORY_UNGROUNDED");
  });
});

describe("R12", () => {
  it("E_RECORD_TAMPERED when chain.recordHash does not match the recomputed hash", () => {
    const record = makeMinimalRecord({ chain: { prevRunId: null, prevRecordHash: null, recordHash: "not-the-real-hash" } });
    expect(codesOf(record)).toContain("E_RECORD_TAMPERED");
  });
});

describe("R14", () => {
  it("E_METRIC_AS_FINDING when a metric carries a severity field", () => {
    const record = makeMinimalRecord({
      metrics: [{ id: "m-1", targetId: "agentjames", name: "response_time_ms", value: 100, unit: "ms", note: "recorded, not judged", severity: "high" } as never],
    });
    expect(codesOf(record)).toContain("E_METRIC_AS_FINDING");
  });
});

describe("R15", () => {
  it("E_SECRET_LEAK when a github-token-shaped string appears anywhere in the record", () => {
    const record = makeMinimalRecord({ commit: "ghp_abcdefghijklmnopqrstuvwxyz012345" });
    expect(codesOf(record)).toContain("E_SECRET_LEAK");
  });

  it("E_SECRET_LEAK when a check's evidence.headers carries a non-allowlisted header", () => {
    const check = makeCheck({ id: "chk-1", verdict: "pass", evidence: { redirects: [], headers: { "set-cookie": "session=x" } } });
    const record = makeMinimalRecord({ checks: [check] });
    expect(codesOf(record)).toContain("E_SECRET_LEAK");
  });
});

describe("--rerun-rules (R13)", () => {
  it("does not fire on a genuinely reproduced pass", async () => {
    expect(codesOf(await healthyRecord(), { rerunRules: true })).not.toContain("E_MANUFACTURED_FINDING");
  });

  it("E_MANUFACTURED_FINDING when a finding statement was hand-edited", () => {
    const check = makeCheck({ id: "chk-1", verdict: "finding", evidence: { status: 503, redirects: [], headers: {} } });
    const finding = makeFinding({ checkId: "chk-1", statement: "this text was not produced by the template" });
    const record = makeMinimalRecord({ checks: [check], findings: [finding] });
    expect(codesOf(record, { rerunRules: true })).toContain("E_MANUFACTURED_FINDING");
  });

  it("does not attempt to re-derive a not_published skip (no rule was ever consulted for it)", () => {
    const check = makeCheck({ id: "chk-1", verdict: "skipped", skipReason: "not_published" });
    const record = makeMinimalRecord({
      checks: [check],
      absenceOfEvidence: { statement: "x", checksClean: 0, byFamily: {}, notChecked: [{ checkId: "chk-1", reasonCode: "not_published" }] },
    });
    expect(codesOf(record, { rerunRules: true })).not.toContain("E_MANUFACTURED_FINDING");
  });
});
