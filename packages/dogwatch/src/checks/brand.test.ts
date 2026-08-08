import { describe, expect, it } from "vitest";
import { evaluateBrandBacklink, evaluateBrandFavicon } from "./brand.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "sluice",
  checkId: "brand:sluice:brand.backlink_missing",
  request: { method: "GET", url: "https://sluice.example" },
  observedAt: "2026-08-08T15:00:00.000Z",
};

describe("evaluateBrandBacklink", () => {
  it("passes when the recorded fact says the backlink is present", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: {},
      json: { page: "https://sluice.example", bodyContainsBacklink: true },
    };
    expect(evaluateBrandBacklink(evidence, ctx).verdict).toBe("pass");
  });

  it("finds low severity when the backlink is absent", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: {},
      json: { page: "https://sluice.example", bodyContainsBacklink: false },
    };
    const outcome = evaluateBrandBacklink(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
    expect(outcome.findingStatement).toContain("agentjames.vercel.app");
  });
});

describe("evaluateBrandFavicon", () => {
  it("passes when the favicon responds 200", () => {
    const evidence: CheckEvidence = { status: 200, redirects: [], headers: {} };
    expect(evaluateBrandFavicon(evidence, ctx).verdict).toBe("pass");
  });

  it("finds low severity when the favicon does not respond 200", () => {
    const evidence: CheckEvidence = { status: 404, redirects: [], headers: {} };
    const outcome = evaluateBrandFavicon(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
  });
});
