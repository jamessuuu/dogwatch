import { describe, expect, it } from "vitest";
import { resolveHysteresis } from "./hysteresis.js";

describe("resolveHysteresis", () => {
  it("confirms a high-severity finding on first sight", () => {
    const result = resolveHysteresis({ fingerprint: "fp-1", severity: "high", runId: "run-2" }, []);
    expect(result).toEqual({ status: "confirmed", firstSeenRunId: "run-2" });
  });

  it("marks a medium finding unconfirmed on night one", () => {
    const result = resolveHysteresis({ fingerprint: "fp-1", severity: "medium", runId: "run-1" }, []);
    expect(result).toEqual({ status: "unconfirmed", firstSeenRunId: "run-1" });
  });

  it("confirms a medium finding seen in a second consecutive run", () => {
    const previous = [{ fingerprint: "fp-1", firstSeenRunId: "run-1" }];
    const result = resolveHysteresis({ fingerprint: "fp-1", severity: "medium", runId: "run-2" }, previous);
    expect(result).toEqual({ status: "confirmed", firstSeenRunId: "run-1" });
  });

  it("preserves firstSeenRunId across confirmation, not the run that confirmed it", () => {
    const previous = [{ fingerprint: "fp-1", firstSeenRunId: "run-1" }];
    const result = resolveHysteresis({ fingerprint: "fp-1", severity: "low", runId: "run-3" }, previous);
    expect(result.firstSeenRunId).toBe("run-1");
  });

  it("treats a low-severity finding not seen before as unconfirmed", () => {
    const result = resolveHysteresis({ fingerprint: "fp-2", severity: "low", runId: "run-5" }, [
      { fingerprint: "fp-1", firstSeenRunId: "run-1" },
    ]);
    expect(result.status).toBe("unconfirmed");
  });

  it("a high finding uses its own prior firstSeenRunId if it recurs", () => {
    const previous = [{ fingerprint: "fp-1", firstSeenRunId: "run-1" }];
    const result = resolveHysteresis({ fingerprint: "fp-1", severity: "high", runId: "run-9" }, previous);
    expect(result).toEqual({ status: "confirmed", firstSeenRunId: "run-1" });
  });
});
