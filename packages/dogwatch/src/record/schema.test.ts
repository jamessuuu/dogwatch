/**
 * SPEC §3: this file is the Zod source of truth `schemas/run-record.v1.json`
 * is generated from (`pnpm schema:gen`) — a round-trip test here is a test
 * of the actual published contract, not an implementation detail.
 */
import { describe, expect, it } from "vitest";
import { RunRecordSchema, TERMINAL_VERDICTS, VerdictSchema } from "./schema.js";
import { makeMinimalRecord } from "./test-helper.js";

describe("RunRecordSchema", () => {
  it("accepts a minimal, well-formed record", () => {
    const result = RunRecordSchema.safeParse(makeMinimalRecord());
    expect(result.success).toBe(true);
  });

  it("rejects an unknown top-level field (strictObject)", () => {
    const record = { ...makeMinimalRecord(), notARealField: true };
    expect(RunRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects a wrong formatVersion", () => {
    const record = { ...makeMinimalRecord(), formatVersion: 2 };
    expect(RunRecordSchema.safeParse(record).success).toBe(false);
  });

  it("requires every finding to carry at least one source", () => {
    const record = makeMinimalRecord({
      checks: [
        {
          id: "chk-1",
          family: "reach",
          targetId: "agentjames",
          ruleId: "reach.status_not_200",
          title: "/ reachable",
          request: { method: "GET", url: "https://agentjames.vercel.app", headersSent: [], timeoutMs: 10_000 },
          observedAt: "2026-08-08T15:00:00.000Z",
          verdict: "finding",
          evidence: { status: 503, redirects: [], headers: {} },
          reproduce: 'curl -sS "https://agentjames.vercel.app"',
        },
      ],
      findings: [
        {
          id: "F-abc123",
          checkId: "chk-1",
          ruleId: "reach.status_not_200",
          severity: "high",
          status: "confirmed",
          statement: "x",
          sources: [],
          firstSeenRunId: "run-1",
          fingerprint: "fp-1",
        },
      ],
    });
    expect(RunRecordSchema.safeParse(record).success).toBe(false);
  });

  it("round-trips through JSON.stringify/parse without loss", () => {
    const record = makeMinimalRecord();
    const roundTripped: unknown = JSON.parse(JSON.stringify(record));
    const result = RunRecordSchema.safeParse(roundTripped);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual(record);
  });
});

describe("VerdictSchema / TERMINAL_VERDICTS", () => {
  it("pending is a legal Verdict but never a terminal one (R1's target)", () => {
    expect(VerdictSchema.safeParse("pending").success).toBe(true);
    expect(TERMINAL_VERDICTS).not.toContain("pending");
  });

  it("every terminal verdict is a legal Verdict", () => {
    for (const v of TERMINAL_VERDICTS) {
      expect(VerdictSchema.safeParse(v).success).toBe(true);
    }
  });
});
