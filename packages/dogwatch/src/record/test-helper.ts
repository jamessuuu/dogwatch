/**
 * Shared builders for a minimal, schema-valid `RunRecord` — used by unit
 * tests across src/record and src/verify so each test file does not
 * hand-roll the ~20-field record shape. Deliberately NOT a `.test.ts` file
 * (vitest would try to run it as a suite with zero tests and fail); it is a
 * plain module other test files import from.
 */
import type { Check, Finding, RunRecord } from "./schema.js";
import type { PricingManifest } from "./pricing-schema.js";

let counter = 0;

/** Mirrors the real, committed `pricing.2026-08-08.json` (SPEC §8: "every
 * price comes from pricing.<date>.json, never a constant") — tests pass
 * this object directly rather than reading the file, so `buildRun` never
 * touches the filesystem in a unit test. */
export const TEST_PRICING_MANIFEST: PricingManifest = {
  formatVersion: 1,
  effectiveDate: "2026-08-08",
  note: "test fixture mirroring the real pricing.2026-08-08.json",
  llm: {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    inputPerMTokUsd: 1.0,
    outputPerMTokUsd: 5.0,
  },
  infra: {
    githubActionsPerMinuteUsd: 0,
    githubActionsNote: "public repo, unmetered (SPEC §5)",
    neonComputePerCuHourUsd: 0,
    neonComputeNote: "Free tier, 100 CU-hr/month (SPEC §5); not used before M4",
  },
};

/** A deterministic, schema-valid check with a `pass` verdict. */
export function makeCheck(overrides?: Partial<Check>): Check {
  counter += 1;
  const targetId = overrides?.targetId ?? "agentjames";
  const ruleId = overrides?.ruleId ?? "reach.status_not_200";
  return {
    id: `reach:${targetId}:${ruleId}:${String(counter)}`,
    family: "reach",
    targetId,
    ruleId,
    title: "/ reachable",
    request: { method: "GET", url: "https://agentjames.vercel.app", headersSent: [], timeoutMs: 10_000 },
    observedAt: "2026-08-08T15:00:00.000Z",
    verdict: "pass",
    evidence: { status: 200, finalUrl: "https://agentjames.vercel.app", redirects: [], headers: {} },
    reproduce: 'curl -sS "https://agentjames.vercel.app"',
    ...overrides,
  };
}

export function makeFinding(overrides?: Partial<Finding>): Finding {
  return {
    id: "F-abcdef123456",
    checkId: "reach:agentjames:reach.status_not_200:1",
    ruleId: "reach.status_not_200",
    severity: "high",
    status: "confirmed",
    statement: "GET https://agentjames.vercel.app → 503 at 2026-08-08T15:00:00.000Z",
    sources: [
      {
        url: "https://agentjames.vercel.app",
        method: "GET",
        status: 503,
        retrievedAt: "2026-08-08T15:00:00.000Z",
        evidencePath: 'checks[?(@.id=="reach:agentjames:reach.status_not_200:1")].evidence',
      },
    ],
    firstSeenRunId: "run-1",
    fingerprint: "fingerprint-1",
    ...overrides,
  };
}

/** A minimal, `RunRecordSchema`-valid record with zero checks (rubric R1 is
 * a separate, stricter concern from Zod validity — most tests want a record
 * that merely parses, then mutate specific fields). */
export function makeMinimalRecord(overrides?: Partial<RunRecord>): RunRecord {
  return {
    formatVersion: 1,
    runId: "run-1",
    kind: "manual",
    watchVersion: "0.1.0-alpha.0",
    checkPackVersion: "1",
    commit: "0000000000000000000000000000000000000",
    targetsHash: "targets-hash",
    pricingManifest: "pricing.2026-08-08.json",
    scheduledFor: null,
    startedAt: "2026-08-08T15:00:00.000Z",
    endedAt: "2026-08-08T15:00:01.000Z",
    trigger: { workflow: null, runUrl: null, actor: "local" },
    checks: [],
    findings: [],
    absenceOfEvidence: { statement: "no checks ran this watch", checksClean: 0, byFamily: {}, notChecked: [] },
    metrics: [],
    actions: [],
    gates: [],
    refusals: [],
    cost: { currency: "USD", microUsd: 0, certainty: "reported", breakdown: {}, method: "pricing.2026-08-08.json" },
    llm: { calls: 0, inputTokens: 0, outputTokens: 0, microUsd: 0, reason: "no_findings" },
    degraded: [],
    audit: {
      namespace: "dogwatch",
      store: "memory",
      fromSeq: 0,
      toSeq: 0,
      prevHead: null,
      head: null,
      verified: true,
      events: [],
    },
    // A non-empty placeholder, not the real hash of the rest of this object
    // — `chain.recordHash` is schema-required to be non-empty (`.min(1)`),
    // but computing the TRUE hash here would make every other field this
    // helper's callers override silently stale. Tests that care about the
    // real hash (hash.test.ts, rubric.test.ts's R12 cases) compute or
    // deliberately mismatch it explicitly.
    chain: { prevRunId: null, prevRecordHash: null, recordHash: "0".repeat(64) },
    amendments: [],
    ...overrides,
  };
}
