import { describe, expect, it } from "vitest";
import { evaluateReachRedirectChain, evaluateReachStatus } from "./reach.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "agentjames",
  checkId: "reach:agentjames:reach.status_not_200",
  request: { method: "GET", url: "https://agentjames.vercel.app" },
  observedAt: "2026-08-08T15:00:00.000Z",
};

describe("evaluateReachStatus", () => {
  it("passes on 200", () => {
    const evidence: CheckEvidence = { status: 200, redirects: [], headers: {} };
    expect(evaluateReachStatus(evidence, ctx).verdict).toBe("pass");
  });

  it("finds high severity on 5xx", () => {
    const evidence: CheckEvidence = { status: 503, redirects: [], headers: {} };
    const outcome = evaluateReachStatus(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("high");
    expect(outcome.findingStatement).toBe(
      "GET https://agentjames.vercel.app → 503 at 2026-08-08T15:00:00.000Z"
    );
  });

  it("finds medium severity on 4xx", () => {
    const evidence: CheckEvidence = { status: 404, redirects: [], headers: {} };
    const outcome = evaluateReachStatus(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
  });

  it("errors when there is no status at all (transport failure)", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {} };
    const outcome = evaluateReachStatus(evidence, ctx);
    expect(outcome.verdict).toBe("error");
    expect(outcome.errorCode).toBe("network_error");
  });

  it("is a pure function: same evidence in, same outcome out", () => {
    const evidence: CheckEvidence = { status: 200, redirects: [], headers: {} };
    expect(evaluateReachStatus(evidence, ctx)).toEqual(evaluateReachStatus(evidence, ctx));
  });
});

describe("evaluateReachRedirectChain", () => {
  it("passes with no prior baseline (first-ever observation)", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://agentjames.vercel.app",
      redirects: [],
      headers: {},
    };
    expect(evaluateReachRedirectChain(evidence, ctx).verdict).toBe("pass");
  });

  it("passes when the chain matches the baseline exactly", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://agentjames.vercel.app",
      redirects: [{ status: 308, url: "https://agentjames.vercel.app/" }],
      headers: {},
      json: {
        baseline: {
          finalUrl: "https://agentjames.vercel.app",
          redirects: [{ status: 308, url: "https://agentjames.vercel.app/" }],
        },
      },
    };
    expect(evaluateReachRedirectChain(evidence, ctx).verdict).toBe("pass");
  });

  it("finds when the final URL drifts from the baseline", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://agentjames.vercel.app/new",
      redirects: [],
      headers: {},
      json: { baseline: { finalUrl: "https://agentjames.vercel.app", redirects: null } },
    };
    const outcome = evaluateReachRedirectChain(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("medium");
    expect(outcome.findingStatement).toContain("final URL changed");
  });

  it("finds when the redirect hop count drifts", () => {
    const evidence: CheckEvidence = {
      finalUrl: "https://agentjames.vercel.app",
      redirects: [{ status: 301, url: "https://agentjames.vercel.app/a" }],
      headers: {},
      json: { baseline: { finalUrl: "https://agentjames.vercel.app", redirects: [] } },
    };
    expect(evaluateReachRedirectChain(evidence, ctx).verdict).toBe("finding");
  });

  it("errors when finalUrl is missing (transport failure)", () => {
    const evidence: CheckEvidence = { redirects: [], headers: {} };
    expect(evaluateReachRedirectChain(evidence, ctx).verdict).toBe("error");
  });
});
