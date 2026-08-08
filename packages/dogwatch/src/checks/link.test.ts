import { describe, expect, it } from "vitest";
import { evaluateLinkBroken, evaluateLinkOffsiteRedirect } from "./link.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "sluice",
  checkId: "link:sluice:link.broken",
  request: { method: "HEAD", url: "https://example.com/a" },
  observedAt: "2026-08-08T15:00:00.000Z",
};

describe("evaluateLinkBroken", () => {
  it("passes on a 2xx/3xx status", () => {
    const evidence: CheckEvidence = {
      status: 200,
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/a", sourcePage: "https://sluice.example" },
    };
    expect(evaluateLinkBroken(evidence, ctx).verdict).toBe("pass");
  });

  it("finds medium severity on a 4xx/5xx status", () => {
    const evidence: CheckEvidence = {
      status: 404,
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/a", sourcePage: "https://sluice.example" },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
  });

  it("finds when there is no status at all (transport failure surfaced as broken)", () => {
    const evidence: CheckEvidence = {
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/a", sourcePage: "https://sluice.example" },
    };
    expect(evaluateLinkBroken(evidence, ctx).verdict).toBe("finding");
  });
});

describe("evaluateLinkOffsiteRedirect", () => {
  it("skips when the link was already external before any redirect", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://other.example/",
      redirects: [],
      headers: {},
      json: { linkUrl: "https://other.example/a", sourcePage: "https://sluice.example", sourceOrigin: "https://sluice.example" },
    };
    expect(evaluateLinkOffsiteRedirect(evidence, ctx).verdict).toBe("skipped");
  });

  it("passes when a same-origin link stays same-origin", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://sluice.example/b",
      redirects: [],
      headers: {},
      json: { linkUrl: "https://sluice.example/a", sourcePage: "https://sluice.example", sourceOrigin: "https://sluice.example" },
    };
    expect(evaluateLinkOffsiteRedirect(evidence, ctx).verdict).toBe("pass");
  });

  it("finds medium severity when a same-origin link redirects off-site", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://other.example/",
      redirects: [],
      headers: {},
      json: { linkUrl: "https://sluice.example/a", sourcePage: "https://sluice.example", sourceOrigin: "https://sluice.example" },
    };
    const outcome = evaluateLinkOffsiteRedirect(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
  });
});
