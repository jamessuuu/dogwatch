import { describe, expect, it } from "vitest";
import { buildAbsenceOfEvidence } from "./absence.js";
import { makeCheck } from "./test-helper.js";

describe("buildAbsenceOfEvidence", () => {
  it("reports a genuinely quiet run: all clean, nothing skipped", () => {
    const checks = [makeCheck({ id: "a", verdict: "pass" }), makeCheck({ id: "b", verdict: "pass" })];
    const out = buildAbsenceOfEvidence(checks);
    expect(out.checksClean).toBe(2);
    expect(out.notChecked).toHaveLength(0);
    expect(out.byFamily.reach).toBe(2);
    expect(out.statement.length).toBeGreaterThan(0);
  });

  it("counts skipped checks with their reason into notChecked", () => {
    const checks = [
      makeCheck({ id: "a", verdict: "pass" }),
      makeCheck({ id: "b", verdict: "skipped", skipReason: "not_published" }),
    ];
    const out = buildAbsenceOfEvidence(checks);
    expect(out.checksClean).toBe(1);
    expect(out.notChecked).toEqual([{ checkId: "b", reasonCode: "not_published" }]);
  });

  it("counts errored checks with their error code into notChecked", () => {
    const checks = [makeCheck({ id: "a", verdict: "error", errorCode: "timeout" })];
    const out = buildAbsenceOfEvidence(checks);
    expect(out.notChecked).toEqual([{ checkId: "a", reasonCode: "timeout" }]);
  });

  it("does not count a finding-verdict check as clean", () => {
    const checks = [makeCheck({ id: "a", verdict: "finding" })];
    const out = buildAbsenceOfEvidence(checks);
    expect(out.checksClean).toBe(0);
    expect(out.notChecked).toHaveLength(0);
  });

  it("handles zero checks honestly", () => {
    const out = buildAbsenceOfEvidence([]);
    expect(out.checksClean).toBe(0);
    expect(out.statement).toMatch(/no checks ran/);
  });

  it("byFamily only tallies passes, grouped by family", () => {
    const checks = [
      makeCheck({ id: "a", family: "reach", verdict: "pass" }),
      makeCheck({ id: "b", family: "header", verdict: "pass" }),
      makeCheck({ id: "c", family: "header", verdict: "pass" }),
    ];
    const out = buildAbsenceOfEvidence(checks);
    expect(out.byFamily).toEqual({ reach: 1, header: 2 });
  });
});
