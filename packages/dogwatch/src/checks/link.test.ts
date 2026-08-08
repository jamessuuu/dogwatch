import { describe, expect, it } from "vitest";
import { evaluateLinkBroken, evaluateLinkOffsiteRedirect, evaluateLinkUnverifiable, LINK_BROKEN, LINK_UNVERIFIABLE } from "./link.js";
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

// The three link-classification classes (link classification fix,
// 2026-08-09 — the first published run reported ebizolution's 403 and
// LinkedIn's 999 as link.broken, which would be permanent nightly noise for
// two links that are not actually dead). Fixtures assert the exact rule id
// each class produces, per the task's requirement.
describe("link classification — broken / unverifiable / head-unsupported-but-alive", () => {
  it("class 1 — broken: a plain 404 (no bot-block shape) is link.broken with no retry needed", () => {
    const evidence: CheckEvidence = {
      status: 404,
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/gone", sourcePage: "https://sluice.example" },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_BROKEN);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
    expect(outcome.findingStatement).toBe(
      "HEAD https://example.com/gone (linked from https://sluice.example) → 404 at 2026-08-08T15:00:00.000Z"
    );
  });

  it("class 1 — broken: a bot-block-shaped HEAD (403) whose GET retry confirms 404 is still link.broken", () => {
    // Real-world shape: a WAF returns 403 to a HEAD-only crawler, but the
    // resource is independently confirmed gone by the GET retry.
    const evidence: CheckEvidence = {
      status: 403,
      redirects: [],
      headers: {},
      json: {
        linkUrl: "https://www.ebizolution.com/",
        sourcePage: "https://agentjames.vercel.app/hire",
        retry: { method: "GET", status: 404, finalUrl: "https://www.ebizolution.com/" },
      },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_BROKEN);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
    expect(outcome.findingStatement).toContain("→ 403 at");
    expect(outcome.findingStatement).toContain("retried GET → 404");
  });

  it("class 2 — unverifiable: LinkedIn's 999 with no successful retry is link.unverifiable, not link.broken", () => {
    // The exact real shape from the first published run:
    // HEAD https://www.linkedin.com/in/... → 999, and LinkedIn also
    // bot-blocks the GET retry (403) — dogwatch made two requests and still
    // cannot say whether the profile is alive.
    const evidence: CheckEvidence = {
      status: 999,
      redirects: [],
      headers: {},
      json: {
        linkUrl: "https://www.linkedin.com/in/james-lorenz-santos-720776251/",
        sourcePage: "https://agentjames.vercel.app/resume",
        retry: { method: "GET", status: 403, finalUrl: "https://www.linkedin.com/in/james-lorenz-santos-720776251/" },
      },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_UNVERIFIABLE);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
    expect(outcome.findingStatement).toBe(
      "HEAD https://www.linkedin.com/in/james-lorenz-santos-720776251/ (linked from https://agentjames.vercel.app/resume) → 999; retried GET → 403 at 2026-08-08T15:00:00.000Z"
    );
    // The dedicated ruleId is independently reachable too — R13 rerun keys
    // off this same function under both ruleIds (checks/index.ts).
    expect(evaluateLinkUnverifiable(evidence, ctx)).toEqual(outcome);
  });

  it("class 2 — unverifiable: a bot-block status with no retry recorded at all stays unverifiable, never broken", () => {
    const evidence: CheckEvidence = {
      status: 429,
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/rate-limited", sourcePage: "https://sluice.example" },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_UNVERIFIABLE);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("low");
  });

  it("class 2 — unverifiable: a bot-block status whose retry errors out (no status) stays unverifiable", () => {
    const evidence: CheckEvidence = {
      status: 406,
      redirects: [],
      headers: {},
      json: { linkUrl: "https://example.com/odd", sourcePage: "https://sluice.example", retry: { method: "GET" } },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_UNVERIFIABLE);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingStatement).toContain("retried GET → no response");
  });

  it("class 3 — head-unsupported-but-alive: a HEAD-only 403 that GETs 200 passes as link.broken, not a finding", () => {
    const evidence: CheckEvidence = {
      status: 403,
      redirects: [],
      headers: {},
      json: {
        linkUrl: "https://example.com/head-unsupported",
        sourcePage: "https://sluice.example",
        retry: { method: "GET", status: 200, finalUrl: "https://example.com/head-unsupported" },
      },
    };
    const outcome = evaluateLinkBroken(evidence, ctx);
    expect(outcome.ruleId).toBe(LINK_BROKEN);
    expect(outcome.verdict).toBe("pass");
    expect(outcome.findingStatement).toBeUndefined();
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
