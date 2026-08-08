import { MemoryStore } from "@jamessuuu/sluice";
import { describe, expect, it } from "vitest";
import { buildRun } from "./build-run.js";
import { createReplayHttpProbe } from "../probe/replay.js";
import { TEST_PRICING_MANIFEST } from "./test-helper.js";
import { verifyRecord } from "../verify/rubric.js";
import { FakeGithubTransport, proposeAndGateFindings } from "../effects/index.js";
import type { RunRecord } from "./schema.js";
import type { TargetsFile } from "./targets-schema.js";
import type { HttpGetResult, HttpHeadResult } from "../probe/types.js";

const FIXED_NOW_MS = Date.parse("2026-08-08T15:00:00.000Z");

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function okResult(overrides?: Partial<HttpGetResult>): HttpGetResult {
  return {
    status: 200,
    finalUrl: "https://agentjames.vercel.app",
    redirects: [],
    headers: { "strict-transport-security": "max-age=63072000" },
    bodyText: "<html></html>",
    bodyTruncated: false,
    bytes: 13,
    ms: 42,
    bodySha256: "0".repeat(64),
    ...overrides,
  };
}

const oneDeployedSite: TargetsFile = {
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

async function buildTestRun(transcriptGet: Record<string, HttpGetResult>) {
  return buildRun({
    targets: oneDeployedSite,
    targetsHash: "test-targets-hash",
    probe: createReplayHttpProbe({ get: transcriptGet }),
    now: () => FIXED_NOW_MS,
    random: seededRandom(1),
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

describe("buildRun — quiet run (200 OK)", () => {
  it("produces two pass checks and zero findings", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.checks).toHaveLength(2);
    expect(record.checks.every((c) => c.verdict === "pass")).toBe(true);
    expect(record.findings).toHaveLength(0);
  });

  it("populates a real, verified sluice audit trail — not an empty stub", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.audit.events.length).toBeGreaterThan(0);
    expect(record.audit.verified).toBe(true);
    expect(record.audit.head).not.toBeNull();
    expect(record.audit.store).toBe("memory");
  });

  it("populates absenceOfEvidence honestly on a quiet run", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.absenceOfEvidence.checksClean).toBe(2);
    expect(record.absenceOfEvidence.notChecked).toHaveLength(0);
  });

  it("costs exactly $0 and makes zero LLM calls (M0-M2: no model, no metered infra)", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.cost.microUsd).toBe(0);
    expect(record.llm.calls).toBe(0);
    expect(record.llm.reason).toBe("no_findings");
  });

  it("stamps a self-consistent chain.recordHash with no predecessor", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.chain.prevRunId).toBeNull();
    expect(record.chain.prevRecordHash).toBeNull();
    expect(record.chain.recordHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic: the same inputs (frozen clock, seeded random, same transcript) build byte-identical records", async () => {
    const a = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    const b = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(a).toEqual(b);
  });
});

describe("buildRun — findings run (503)", () => {
  it("produces a high-severity finding sourced from the check's own evidence", async () => {
    const record = await buildTestRun({
      "https://agentjames.vercel.app": okResult({ status: 503, bodyText: "" }),
    });
    expect(record.findings).toHaveLength(1);
    const finding = record.findings[0];
    expect(finding?.severity).toBe("high");
    expect(finding?.status).toBe("confirmed"); // high severity confirms on first sight (SPEC §2 hysteresis)
    expect(finding?.sources[0]?.url).toBe("https://agentjames.vercel.app");
  });

  it("degrades honestly (no ANTHROPIC_API_KEY configured in this test) instead of pretending a call happened", async () => {
    // M3 (SPEC §8): buildTestRun never passes an llmClient, mirroring every
    // local/dev/CI-without-secret invocation of `dogwatch watch` — the
    // advisory pipeline must degrade, never crash and never fabricate a call.
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult({ status: 503 }) });
    expect(record.llm.calls).toBe(0);
    expect(record.llm.reason).toBe("api_error");
    expect(record.degraded).toEqual([{ component: "llm", reason: "api_error" }]);
    expect(record.cost.microUsd).toBe(0);
  });
});

const linkSite: TargetsFile = {
  formatVersion: 1,
  sites: [
    {
      id: "agentjames",
      name: "Agent James",
      url: "https://agentjames.vercel.app",
      repo: "jamessuuu/agentjames",
      deployed: true,
      families: ["link"],
      expectedHeaders: [],
      weightBudgetBytes: 300_000,
    },
  ],
  repos: [],
  packages: [],
  artifacts: [],
  actionPolicy: { issueRepos: [], confirmations: 2, gateTimeoutHours: 48 },
};

function homepageWithLink(linkUrl: string): HttpGetResult {
  return okResult({ bodyText: `<!doctype html><html><body><a href="${linkUrl}">link</a></body></html>`, bytes: 80 });
}

describe("buildRun — link retry orchestration (link classification fix, 2026-08-09)", () => {
  it("HEAD 999 + GET retry also blocked (403) publishes link.unverifiable, never link.broken", async () => {
    const linkUrl = "https://www.linkedin.com/in/james-lorenz-santos-720776251/";
    const record = await buildRun({
      targets: linkSite,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({
        get: {
          "https://agentjames.vercel.app": homepageWithLink(linkUrl),
          [linkUrl]: okResult({ status: 403, finalUrl: linkUrl, bodyText: "" }),
        },
        head: {
          [linkUrl]: { status: 999, finalUrl: linkUrl, redirects: [], headers: {}, ms: 10 } satisfies HttpHeadResult,
        },
      }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(3),
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

    const linkCheck = record.checks.find((c) => c.id === `link:agentjames:link.broken:${linkUrl}`);
    expect(linkCheck?.verdict).toBe("finding");
    expect(linkCheck?.ruleId).toBe("link.unverifiable");
    expect(record.findings).toHaveLength(1);
    expect(record.findings[0]?.severity).toBe("low");
    expect(record.findings[0]?.statement).toContain("→ 999; retried GET → 403");
  });

  it("HEAD 403 + GET retry 200 publishes a pass — a HEAD-unsupported server is not a broken link", async () => {
    const linkUrl = "https://www.ebizolution.com/";
    const record = await buildRun({
      targets: linkSite,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({
        get: {
          "https://agentjames.vercel.app": homepageWithLink(linkUrl),
          [linkUrl]: okResult({ status: 200, finalUrl: linkUrl }),
        },
        head: {
          [linkUrl]: { status: 403, finalUrl: linkUrl, redirects: [], headers: {}, ms: 10 } satisfies HttpHeadResult,
        },
      }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(4),
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

    const linkCheck = record.checks.find((c) => c.id === `link:agentjames:link.broken:${linkUrl}`);
    expect(linkCheck?.verdict).toBe("pass");
    expect(linkCheck?.ruleId).toBe("link.broken");
    expect(record.findings).toHaveLength(0);
  });
});

describe("buildRun — M4 cross-run chain anchoring", () => {
  async function buildAnchoredRun(o: {
    store: MemoryStore;
    prevRecord: RunRecord | null;
    seed: number;
  }): Promise<RunRecord> {
    return buildRun({
      targets: oneDeployedSite,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({ get: { "https://agentjames.vercel.app": okResult() } }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(o.seed),
      commit: "0".repeat(40),
      watchVersion: "0.0.0-test",
      checkPackVersion: "1",
      pricingManifest: "pricing.2026-08-08.json",
      pricing: TEST_PRICING_MANIFEST,
      kind: "manual",
      scheduledFor: null,
      trigger: { workflow: null, runUrl: null, actor: "test" },
      prevRecord: o.prevRecord,
      // A shared MemoryStore across two buildRun calls is the exact shape a
      // shared, persistent Postgres store has across two nights: the SAME
      // sluice_cursor row (here, MemoryStore's own namespace state)
      // accumulates seq/hash across both calls. storeKind:"postgres" is what
      // tells buildRun to treat that persistence as real (anchor the query
      // cursor at prevRecord.audit.toSeq instead of always 0).
      store: o.store,
      storeKind: "postgres",
    });
  }

  it("a fresh MemoryStore run defaults to unanchored, memory-store, no chain_gap check even with a prevRecord", async () => {
    const record = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(record.audit.store).toBe("memory");
    expect(record.chain.anchored).toBe(false);
    expect(record.audit.prevHead).toBeNull();
    expect(record.checks.some((c) => c.ruleId === "watch.chain_gap")).toBe(false);
  });

  it("run 1 (no prevRecord) publishes store:postgres, anchored:true, and no chain_gap check (nothing to be discontinuous with)", async () => {
    const store = new MemoryStore();
    const run1 = await buildAnchoredRun({ store, prevRecord: null, seed: 10 });
    expect(run1.audit.store).toBe("postgres");
    expect(run1.chain.anchored).toBe(true);
    expect(run1.audit.prevHead).toBeNull();
    expect(run1.audit.fromSeq).toBe(1);
    expect(run1.checks.some((c) => c.ruleId === "watch.chain_gap")).toBe(false);
  });

  it("run 2 against the SAME store continues the chain: prevHead matches run 1's head, fromSeq continues, chain_gap check passes clean", async () => {
    const store = new MemoryStore();
    const run1 = await buildAnchoredRun({ store, prevRecord: null, seed: 10 });
    const run2 = await buildAnchoredRun({ store, prevRecord: run1, seed: 11 });

    expect(run2.audit.prevHead).toBe(run1.audit.head);
    expect(run2.audit.fromSeq).toBe(run1.audit.toSeq + 1);
    expect(run2.findings.some((f) => f.ruleId === "watch.chain_gap")).toBe(false);
    const chainGapCheck = run2.checks.find((c) => c.ruleId === "watch.chain_gap");
    expect(chainGapCheck?.verdict).toBe("pass");
  });

  it("a diverged prevRecord.audit.head (store regression/tamper) publishes a high-severity watch.chain_gap finding", async () => {
    const store = new MemoryStore();
    const run1 = await buildAnchoredRun({ store, prevRecord: null, seed: 10 });
    // Simulate git having published a DIFFERENT head than what this store's
    // cursor actually holds (a reset/restored/corrupted Postgres audit
    // trail, or a stray write dogwatch does not know about) — everything
    // else about run1 (toSeq, runId) stays internally consistent so this
    // isolates exactly the head-hash divergence the rule is meant to catch.
    const tamperedPrevRecord: RunRecord = {
      ...run1,
      audit: { ...run1.audit, head: "0".repeat(64) },
    };
    const run2 = await buildAnchoredRun({ store, prevRecord: tamperedPrevRecord, seed: 11 });

    const finding = run2.findings.find((f) => f.ruleId === "watch.chain_gap");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.status).toBe("confirmed"); // high severity confirms on first sight
    const chainGapCheck = run2.checks.find((c) => c.ruleId === "watch.chain_gap");
    expect(chainGapCheck?.verdict).toBe("finding");
  });
});

describe("buildRun — M4 store-unavailable degrade", () => {
  it("publishes degraded:[{component:'store', reason:'store_unavailable'}] only when storeDegradeReason is set", async () => {
    const withoutDegrade = await buildTestRun({ "https://agentjames.vercel.app": okResult() });
    expect(withoutDegrade.degraded.some((d) => d.component === "store")).toBe(false);

    const record = await buildRun({
      targets: oneDeployedSite,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({ get: { "https://agentjames.vercel.app": okResult() } }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(1),
      commit: "0".repeat(40),
      watchVersion: "0.0.0-test",
      checkPackVersion: "1",
      pricingManifest: "pricing.2026-08-08.json",
      pricing: TEST_PRICING_MANIFEST,
      kind: "manual",
      scheduledFor: null,
      trigger: { workflow: null, runUrl: null, actor: "test" },
      prevRecord: null,
      storeKind: "memory",
      storeDegradeReason: "store_unavailable",
    });
    expect(record.degraded).toContainEqual({ component: "store", reason: "store_unavailable" });
    expect(record.audit.store).toBe("memory");
    expect(record.chain.anchored).toBe(false);
  });
});

describe("buildRun — link bug fix, 2026-08-09: non-http(s) schemes + check id uniqueness", () => {
  it("a mailto: link is skipped (not_applicable), never HTTP-probed, and every check id in the run is unique", async () => {
    const brokenA = "https://broken-a.example.com/";
    const brokenB = "https://broken-b.example.com/";
    const mailto = "mailto:hello@example.com";
    const record = await buildRun({
      targets: linkSite,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({
        get: {
          "https://agentjames.vercel.app": okResult({
            bodyText: `<!doctype html><html><body><a href="${brokenA}">a</a><a href="${brokenB}">b</a><a href="${mailto}">mail us</a></body></html>`,
            bytes: 160,
          }),
        },
        // Neither brokenA nor brokenB has a recorded HEAD transcript entry
        // — createReplayHttpProbe throws network_error for both, exercising
        // the exact two-different-links-fail-in-one-run collision the bug
        // fix targets. mailto: must never reach probe.head() at all (no
        // transcript entry is provided for it either — if the fix
        // regressed, this test would throw instead of asserting).
        head: {},
      }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(5),
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

    const ids = record.checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // the actual bug: duplicate ids

    const mailtoCheck = record.checks.find((c) => c.id === `link:agentjames:link.broken:${mailto}`);
    expect(mailtoCheck?.verdict).toBe("skipped");
    expect(mailtoCheck?.skipReason).toBe("not_applicable");

    const checkA = record.checks.find((c) => c.id === `link:agentjames:link.broken:${brokenA}`);
    const checkB = record.checks.find((c) => c.id === `link:agentjames:link.broken:${brokenB}`);
    expect(checkA?.verdict).toBe("error");
    expect(checkB?.verdict).toBe("error");
    expect(checkA?.id).not.toBe(checkB?.id);
  });
});

describe("buildRun — M5 proposeActions hook wiring (build-run.ts <-> src/effects/propose.ts)", () => {
  it("a confirmed, in-policy finding produces a real gate + action + self-repo notification, and the resulting record is rubric-clean", async () => {
    const transport = new FakeGithubTransport();
    const gatedTargets: TargetsFile = {
      ...oneDeployedSite,
      actionPolicy: { issueRepos: ["jamessuuu/agentjames"], confirmations: 2, gateTimeoutHours: 48 },
    };
    const record = await buildRun({
      targets: gatedTargets,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({ get: { "https://agentjames.vercel.app": okResult({ status: 503 }) } }),
      now: () => FIXED_NOW_MS,
      random: seededRandom(7),
      commit: "0".repeat(40),
      watchVersion: "0.0.0-test",
      checkPackVersion: "1",
      pricingManifest: "pricing.2026-08-08.json",
      pricing: TEST_PRICING_MANIFEST,
      kind: "manual",
      scheduledFor: null,
      trigger: { workflow: null, runUrl: null, actor: "test" },
      prevRecord: null,
      store: new MemoryStore(),
      storeKind: "postgres",
      approvalSecret: "s3cr3t",
      proposeActions: (ctx) =>
        proposeAndGateFindings(ctx.findings, {
          sluice: ctx.sluice,
          checks: ctx.checks,
          actionPolicy: gatedTargets.actionPolicy,
          targets: gatedTargets,
          storeKind: ctx.storeKind,
          runId: ctx.runId,
          startedAt: ctx.startedAt,
          now: ctx.now,
          githubTransport: transport,
          gatePageBaseUrl: "https://dogwatch.vercel.app/gate",
        }),
    });

    // reach.status_not_200 on a 503 is HIGH severity -> confirmed on first
    // sight (SPEC §2 hysteresis) -> immediately eligible to propose.
    expect(record.findings[0]?.status).toBe("confirmed");
    expect(record.gates).toHaveLength(1);
    expect(record.gates[0]?.status).toBe("pending");
    expect(record.actions).toHaveLength(1);
    expect(record.actions[0]?.status).toBe("gated_pending");
    expect(transport.issuesOpened("jamessuuu/dogwatch")).toHaveLength(1);

    // The gate-open audit event landed in THIS run's own audit.events (the
    // whole point of running propose BEFORE the final audit query).
    expect(record.audit.events.some((e) => e.type === "gate.opened")).toBe(true);

    expect(verifyRecord(record, { rerunRules: true })).toEqual([]);
  });
});

describe("buildRun — undeployed sites never touch the network", () => {
  it("skips every family with reasonCode not_published, before any request", async () => {
    const [baseSite] = oneDeployedSite.sites;
    if (baseSite === undefined) throw new Error("fixture setup: oneDeployedSite.sites is empty");
    const targets: TargetsFile = {
      ...oneDeployedSite,
      sites: [{ ...baseSite, id: "tiltmeter", url: "https://tiltmeter.vercel.app", deployed: false }],
    };
    const record = await buildRun({
      targets,
      targetsHash: "test-targets-hash",
      probe: createReplayHttpProbe({}), // no transcript entries at all — a real request would throw
      now: () => FIXED_NOW_MS,
      random: seededRandom(2),
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
    expect(record.checks.every((c) => c.verdict === "skipped" && c.skipReason === "not_published")).toBe(true);
  });
});
