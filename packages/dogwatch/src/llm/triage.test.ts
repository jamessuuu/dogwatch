import { describe, expect, it } from "vitest";
import { buildTriageEvidence, TRIAGE_MAX_FINDINGS_IN_EVIDENCE, triage, TriageToolOutputSchema } from "./triage.js";
import { createFakeLlmClient, fakeLlmClientAlwaysThrowing } from "./test-helper.js";
import { LlmError } from "./types.js";
import { makeCheck, makeFinding } from "../record/test-helper.js";
import type { Check, Finding } from "../record/schema.js";

function findingWithCheck(overrides?: { findingOverrides?: Partial<Finding>; checkOverrides?: Partial<Check> }): { finding: Finding; check: Check } {
  const check = makeCheck({
    id: "link:agentjames:link.unverifiable:https://example.com/",
    ruleId: "link.unverifiable",
    family: "link",
    verdict: "finding",
    evidence: { status: 999, redirects: [], headers: { "strict-transport-security": "max-age=63072000" } },
    ...overrides?.checkOverrides,
  });
  const finding = makeFinding({
    id: "F-abc123",
    checkId: check.id,
    ruleId: check.ruleId,
    severity: "low",
    sources: [{ url: "https://example.com/", method: "HEAD", status: 999, retrievedAt: "2026-08-08T15:00:00.000Z", evidencePath: `checks[?(@.id=="${check.id}")].evidence` }],
    ...overrides?.findingOverrides,
  });
  return { finding, check };
}

describe("buildTriageEvidence", () => {
  it("builds one evidence entry per finding, pulling structured fields from its check", () => {
    const { finding, check } = findingWithCheck();
    const evidence = buildTriageEvidence("run-1", [finding], [check]);
    expect(evidence.findingCount).toBe(1);
    expect(evidence.findings).toHaveLength(1);
    const entry = evidence.findings[0];
    expect(entry?.id).toBe("F-abc123");
    expect(entry?.ruleId).toBe("link.unverifiable");
    expect(entry?.evidenceStatus).toBe(999);
    expect(entry?.evidenceHeaders["strict-transport-security"]).toBe("max-age=63072000");
    expect(entry?.sourceUrls).toEqual(["https://example.com/"]);
  });

  it("never includes a page body — evidence is exactly the structured check/finding fields", () => {
    const { finding, check } = findingWithCheck();
    const evidence = buildTriageEvidence("run-1", [finding], [check]);
    const serialized = JSON.stringify(evidence);
    // No field on Check/Finding ever carries a page body (src/probe/http.ts's
    // bodyText never reaches CheckEvidence) — this asserts the evidence
    // bundle's shape stays exactly the declared TriageEvidenceFinding keys.
    expect(Object.keys(evidence.findings[0] ?? {}).sort()).toEqual(
      [
        "checkTitle",
        "evidenceBytes",
        "evidenceHeaders",
        "evidenceMs",
        "evidenceStatus",
        "family",
        "id",
        "requestMethod",
        "requestUrl",
        "ruleId",
        "severity",
        "sourceUrls",
        "status",
      ].sort()
    );
    expect(serialized).not.toContain("bodyText");
  });

  it("bounds the evidence bundle to TRIAGE_MAX_FINDINGS_IN_EVIDENCE findings", () => {
    const pairs = Array.from({ length: TRIAGE_MAX_FINDINGS_IN_EVIDENCE + 5 }, (_, i) =>
      findingWithCheck({
        findingOverrides: { id: `F-${String(i).padStart(6, "0")}`, checkId: `link:agentjames:link.unverifiable:${String(i)}` },
        checkOverrides: { id: `link:agentjames:link.unverifiable:${String(i)}` },
      })
    );
    const evidence = buildTriageEvidence(
      "run-1",
      pairs.map((p) => p.finding),
      pairs.map((p) => p.check)
    );
    expect(evidence.findingCount).toBe(TRIAGE_MAX_FINDINGS_IN_EVIDENCE + 5);
    expect(evidence.findings).toHaveLength(TRIAGE_MAX_FINDINGS_IN_EVIDENCE);
  });

  it("truncates header values to 200 chars (SPEC §8)", () => {
    const longValue = "x".repeat(500);
    const { finding, check } = findingWithCheck({ checkOverrides: { evidence: { status: 999, redirects: [], headers: { "content-type": longValue } } } });
    const evidence = buildTriageEvidence("run-1", [finding], [check]);
    expect(evidence.findings[0]?.evidenceHeaders["content-type"]).toHaveLength(200);
  });
});

describe("TRIAGE_TOOL_INPUT_SCHEMA / TriageToolOutputSchema", () => {
  it("is generated from the same Zod schema the response is validated against", async () => {
    const { TRIAGE_TOOL_INPUT_SCHEMA } = await import("./triage.js");
    expect(TRIAGE_TOOL_INPUT_SCHEMA.type).toBe("object");
    expect(TRIAGE_TOOL_INPUT_SCHEMA.additionalProperties).toBe(false);
    expect((TRIAGE_TOOL_INPUT_SCHEMA.required as string[]).sort()).toEqual(
      ["advisorySeverity", "note", "proposedAction", "referencedFindingIds"].sort()
    );
  });
});

describe("triage — ok outcome", () => {
  it("returns the validated output and real usage when the model answers correctly", async () => {
    const { finding, check } = findingWithCheck();
    const sourceUrl = finding.sources[0]?.url ?? "";
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: `See F-abc123 (${sourceUrl}).`, referencedFindingIds: ["F-abc123"], proposedAction: "watch" },
        usage: { inputTokens: 1200, outputTokens: 80 },
      }),
    ]);
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("expected ok");
    expect(outcome.output.advisorySeverity).toBe("low");
    expect(outcome.usage).toEqual({ inputTokens: 1200, outputTokens: 80 });
  });

  it("sends the evidence delimited in the user turn, never concatenated into the system prompt", async () => {
    const { finding, check } = findingWithCheck();
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: "fine", referencedFindingIds: [], proposedAction: "none" },
        usage: { inputTokens: 100, outputTokens: 20 },
      }),
    ]);
    await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    const request = client.calls[0];
    expect(request?.system).not.toContain(finding.id);
    expect(request?.system).not.toContain("example.com");
    expect(request?.userContent).toContain("<untrusted-evidence>");
    expect(request?.userContent).toContain(finding.id);
    expect(request?.model).toBe("claude-haiku-4-5");
    expect(request?.maxTokens).toBe(800);
  });
});

describe("triage — schema_reject outcome", () => {
  it("rejects a response that fails the Zod schema (still charges real usage)", async () => {
    const { finding, check } = findingWithCheck();
    const client = createFakeLlmClient([
      () => ({ toolInput: { advisorySeverity: "extreme", note: "x", referencedFindingIds: [], proposedAction: "none" }, usage: { inputTokens: 500, outputTokens: 10 } }),
    ]);
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("schema_reject");
    if (outcome.kind !== "schema_reject") throw new Error("expected schema_reject");
    expect(outcome.usage).toEqual({ inputTokens: 500, outputTokens: 10 });
    expect(outcome.problems.length).toBeGreaterThan(0);
  });

  it("rejects referencedFindingIds naming an id outside this run's real findings (the URL/id allowlist validator)", async () => {
    const { finding, check } = findingWithCheck();
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: "fine", referencedFindingIds: ["F-doesnotexist"], proposedAction: "none" },
        usage: { inputTokens: 500, outputTokens: 10 },
      }),
    ]);
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("schema_reject");
    if (outcome.kind !== "schema_reject") throw new Error("expected schema_reject");
    expect(outcome.problems.some((p) => p.includes("F-doesnotexist"))).toBe(true);
  });

  it("rejects a note that cites a URL outside the record's evidence set — catches a fabricated link", async () => {
    const { finding, check } = findingWithCheck();
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: "See https://not-in-evidence.example/phish for details.", referencedFindingIds: ["F-abc123"], proposedAction: "none" },
        usage: { inputTokens: 500, outputTokens: 10 },
      }),
    ]);
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("schema_reject");
    if (outcome.kind !== "schema_reject") throw new Error("expected schema_reject");
    expect(outcome.problems.some((p) => p.includes("not-in-evidence.example"))).toBe(true);
  });

  it("accepts a note that cites a URL actually present in the finding's own evidence", async () => {
    const { finding, check } = findingWithCheck();
    const client = createFakeLlmClient([
      () => ({
        toolInput: { advisorySeverity: "low", note: `See ${finding.sources[0]?.url ?? ""} — matches F-abc123.`, referencedFindingIds: ["F-abc123"], proposedAction: "none" },
        usage: { inputTokens: 500, outputTokens: 10 },
      }),
    ]);
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("ok");
  });
});

describe("triage — transport_error outcome", () => {
  it("classifies an LlmError('timeout') as errorKind timeout", async () => {
    const { finding, check } = findingWithCheck();
    const client = fakeLlmClientAlwaysThrowing(new LlmError("timeout", "took too long"));
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome).toEqual({ kind: "transport_error", errorKind: "timeout", detail: "took too long" });
  });

  it("classifies an LlmError('api_error') as errorKind api_error", async () => {
    const { finding, check } = findingWithCheck();
    const client = fakeLlmClientAlwaysThrowing(new LlmError("api_error", "401 unauthorized"));
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome).toEqual({ kind: "transport_error", errorKind: "api_error", detail: "401 unauthorized" });
  });

  it("classifies an unrecognized thrown value as api_error rather than crashing", async () => {
    const { finding, check } = findingWithCheck();
    const client = fakeLlmClientAlwaysThrowing("a plain string, not an Error");
    const outcome = await triage({ client, runId: "run-1", findings: [finding], checks: [check] });
    expect(outcome.kind).toBe("transport_error");
    if (outcome.kind !== "transport_error") throw new Error("expected transport_error");
    expect(outcome.errorKind).toBe("api_error");
  });
});

// Exercise the exported schema directly too — cheap, and pins the exact
// shape SPEC §8 names.
describe("TriageToolOutputSchema", () => {
  it("matches SPEC §8's forced tool schema exactly", () => {
    const result = TriageToolOutputSchema.safeParse({
      advisorySeverity: "high",
      note: "x".repeat(600),
      referencedFindingIds: ["F-1"],
      proposedAction: "open_issue",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a note over 600 chars", () => {
    const result = TriageToolOutputSchema.safeParse({
      advisorySeverity: "high",
      note: "x".repeat(601),
      referencedFindingIds: [],
      proposedAction: "none",
    });
    expect(result.success).toBe(false);
  });
});
