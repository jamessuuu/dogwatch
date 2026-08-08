import { describe, expect, it } from "vitest";
import { buildRun } from "./build-run.js";
import { createReplayHttpProbe } from "../probe/replay.js";
import { TEST_PRICING_MANIFEST } from "./test-helper.js";
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
