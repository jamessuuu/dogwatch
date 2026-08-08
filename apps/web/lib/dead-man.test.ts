import { describe, expect, it } from "vitest";
import { computeDeadManStatus, nextExpectedIso } from "./dead-man.js";

const LAST_RUN = "2026-08-08T15:00:00.000Z";

describe("nextExpectedIso", () => {
  it("is exactly 24h after the last run (SPEC §5: once a night)", () => {
    expect(nextExpectedIso(LAST_RUN)).toBe("2026-08-09T15:00:00.000Z");
  });
});

describe("computeDeadManStatus — the exact >36h boundary (SPEC §10)", () => {
  const nextExpected = nextExpectedIso(LAST_RUN); // 2026-08-09T15:00:00.000Z

  it("is not late when the next run isn't due yet", () => {
    const now = Date.parse(nextExpected) - 1000;
    expect(computeDeadManStatus(nextExpected, now).isLate).toBe(false);
  });

  it("is not late exactly at the due time (0h late)", () => {
    const now = Date.parse(nextExpected);
    const status = computeDeadManStatus(nextExpected, now);
    expect(status.lateHours).toBe(0);
    expect(status.isLate).toBe(false);
  });

  it("is not late at 35h59m late — just under the threshold", () => {
    const now = Date.parse(nextExpected) + (36 * 3_600_000 - 60_000);
    expect(computeDeadManStatus(nextExpected, now).isLate).toBe(false);
  });

  it("is not late at exactly 36h late — the boundary is strictly greater-than", () => {
    const now = Date.parse(nextExpected) + 36 * 3_600_000;
    const status = computeDeadManStatus(nextExpected, now);
    expect(status.lateHours).toBe(36);
    expect(status.isLate).toBe(false);
  });

  it("is late at 36h1m — one minute past the boundary", () => {
    const now = Date.parse(nextExpected) + 36 * 3_600_000 + 60_000;
    expect(computeDeadManStatus(nextExpected, now).isLate).toBe(true);
  });

  it("is late many days out", () => {
    const now = Date.parse(nextExpected) + 5 * 24 * 3_600_000;
    const status = computeDeadManStatus(nextExpected, now);
    expect(status.isLate).toBe(true);
    expect(status.lateHours).toBeCloseTo(5 * 24, 5);
  });
});
