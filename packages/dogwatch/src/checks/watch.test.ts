import { describe, expect, it } from "vitest";
import { evaluateWatchChainGap, templateWatchChainGap, type ChainGapBaseline } from "./watch.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleContext } from "./context.js";

const ctx: RuleContext = {
  targetId: "dogwatch",
  checkId: "watch:dogwatch:watch.chain_gap",
  request: { method: "internal", url: "sluice://audit" },
  observedAt: "2026-08-09T15:00:00.000Z",
};

function evidenceOf(chainGap: ChainGapBaseline): CheckEvidence {
  return { redirects: [], headers: {}, json: { chainGap } };
}

describe("evaluateWatchChainGap", () => {
  it("passes when the store's first new event continues exactly where git expected", () => {
    const evidence = evidenceOf({
      expectedFromSeq: 3,
      actualFromSeq: 3,
      expectedPrevHead: "abc",
      actualPrevHead: "abc",
    });
    expect(evaluateWatchChainGap(evidence, ctx).verdict).toBe("pass");
  });

  it("passes when both are null/0 (first-ever anchored run)", () => {
    const evidence = evidenceOf({
      expectedFromSeq: 1,
      actualFromSeq: 1,
      expectedPrevHead: null,
      actualPrevHead: null,
    });
    expect(evaluateWatchChainGap(evidence, ctx).verdict).toBe("pass");
  });

  it("finds high severity when the previous head hash does not match, even if seq lines up", () => {
    const evidence = evidenceOf({
      expectedFromSeq: 5,
      actualFromSeq: 5,
      expectedPrevHead: "expected-hash",
      actualPrevHead: "different-hash",
    });
    const outcome = evaluateWatchChainGap(evidence, ctx);
    expect(outcome.verdict).toBe("finding");
    expect(outcome.findingSeverity).toBe("high");
    expect(outcome.findingStatement).toBe(templateWatchChainGap(evidence, ctx));
    expect(outcome.findingStatement).toContain("expected-hash");
    expect(outcome.findingStatement).toContain("different-hash");
  });

  it("finds when the from-seq itself diverges", () => {
    const evidence = evidenceOf({
      expectedFromSeq: 10,
      actualFromSeq: 4,
      expectedPrevHead: "h",
      actualPrevHead: "h2",
    });
    expect(evaluateWatchChainGap(evidence, ctx).verdict).toBe("finding");
  });

  it("is a pure function: same evidence in, same outcome out", () => {
    const evidence = evidenceOf({
      expectedFromSeq: 1,
      actualFromSeq: 1,
      expectedPrevHead: null,
      actualPrevHead: null,
    });
    expect(evaluateWatchChainGap(evidence, ctx)).toEqual(evaluateWatchChainGap(evidence, ctx));
  });
});
