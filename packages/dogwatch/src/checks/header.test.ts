import { describe, expect, it } from "vitest";
import { evaluateHeaderDrift, evaluateHeaderPresence } from "./header.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "agentjames",
  checkId: "header:agentjames:header.missing:strict-transport-security",
  request: { method: "GET", url: "https://agentjames.vercel.app" },
  observedAt: "2026-08-08T15:00:00.000Z",
};

describe("evaluateHeaderPresence", () => {
  it("passes when the declared header is present", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: { "strict-transport-security": "max-age=63072000" },
      json: { headerName: "strict-transport-security" },
    };
    expect(evaluateHeaderPresence(evidence, ctx).verdict).toBe("pass");
  });

  it("finds medium severity when the declared header is absent", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: {},
      json: { headerName: "strict-transport-security" },
    };
    const outcome = evaluateHeaderPresence(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
    expect(outcome.findingStatement).toContain('header "strict-transport-security" missing');
  });

  it("throws if evidence.json.headerName is missing (a caller bug, not a check outcome)", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {} };
    expect(() => evaluateHeaderPresence(evidence, ctx)).toThrow(/headerName is required/);
  });
});

describe("evaluateHeaderDrift", () => {
  it("skips as not_applicable when the header is currently absent", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: {},
      json: { headerName: "strict-transport-security", baselineValue: "max-age=100" },
    };
    const outcome = evaluateHeaderDrift(evidence, ctx);
    expect(outcome.verdict).toBe("skipped");
    expect(outcome.skipReason).toBe("not_applicable");
  });

  it("skips as no_baseline on the first-ever observation", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: { "strict-transport-security": "max-age=100" },
      json: { headerName: "strict-transport-security" },
    };
    const outcome = evaluateHeaderDrift(evidence, ctx);
    expect(outcome.verdict).toBe("skipped");
    expect(outcome.skipReason).toBe("no_baseline");
  });

  it("finds low severity when the value drifted from the baseline", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: { "strict-transport-security": "max-age=200" },
      json: { headerName: "strict-transport-security", baselineValue: "max-age=100" },
    };
    const outcome = evaluateHeaderDrift(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
  });

  it("passes when the value is unchanged from the baseline", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: { "strict-transport-security": "max-age=100" },
      json: { headerName: "strict-transport-security", baselineValue: "max-age=100" },
    };
    expect(evaluateHeaderDrift(evidence, ctx).verdict).toBe("pass");
  });
});
