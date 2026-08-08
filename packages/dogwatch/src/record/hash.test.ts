import { describe, expect, it } from "vitest";
import { baseRecordOf, computeRecordHash } from "./hash.js";
import { makeMinimalRecord } from "./test-helper.js";

describe("computeRecordHash", () => {
  it("is deterministic for the same record", () => {
    const record = makeMinimalRecord();
    expect(computeRecordHash(record)).toBe(computeRecordHash(record));
  });

  it("is independent of chain.recordHash's own current value", () => {
    const a = makeMinimalRecord({ chain: { prevRunId: null, prevRecordHash: null, recordHash: "" } });
    const b = makeMinimalRecord({ chain: { prevRunId: null, prevRecordHash: null, recordHash: "some-stale-value" } });
    expect(computeRecordHash(a)).toBe(computeRecordHash(b));
  });

  it("changes when any other field changes", () => {
    const a = makeMinimalRecord({ runId: "run-1" });
    const b = makeMinimalRecord({ runId: "run-2" });
    expect(computeRecordHash(a)).not.toBe(computeRecordHash(b));
  });

  it("ignores amendments (Decision 2: the base hash excludes them)", () => {
    const a = makeMinimalRecord({ amendments: [] });
    const b = makeMinimalRecord({
      amendments: [
        {
          at: "2026-08-09T00:00:00.000Z",
          by: "operator",
          kind: "gate_decided",
          events: [],
          actions: [],
          refusals: [],
          amendmentHash: "amendment-hash",
        },
      ],
    });
    expect(computeRecordHash(a)).toBe(computeRecordHash(b));
  });

  it("is a 64-char lowercase hex sha256 digest", () => {
    const hash = computeRecordHash(makeMinimalRecord());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("baseRecordOf", () => {
  it("strips amendments and nothing else", () => {
    const record = makeMinimalRecord();
    const base = baseRecordOf(record);
    expect(base).not.toHaveProperty("amendments");
    expect(base.runId).toBe(record.runId);
  });
});
