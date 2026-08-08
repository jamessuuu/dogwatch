/**
 * SPEC §11.3: recorded probe transcripts replayed through the REAL
 * pipeline (buildRun, unmodified — the same function `dogwatch watch`
 * calls) with a frozen clock and seeded ids must reproduce the committed
 * record byte-for-byte. This is what proves published records are
 * reproducible, not merely schema-valid.
 *
 * Parameters here (FIXED_NOW_MS, seededRandom, GOLDEN_TARGETS) must match
 * `scripts/gen-goldens.mts` exactly — that script is the generator, this
 * test is the standing proof the generator's output is still reachable
 * from a clean replay.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRun } from "../packages/dogwatch/src/record/build-run.js";
import { canonicalStringify } from "../packages/dogwatch/src/record/canonical.js";
import { createReplayHttpProbe, type HttpTranscript } from "../packages/dogwatch/src/probe/replay.js";
import { verifyRecord } from "../packages/dogwatch/src/verify/rubric.js";
import { RunRecordSchema } from "../packages/dogwatch/src/record/schema.js";
import { TEST_PRICING_MANIFEST } from "../packages/dogwatch/src/record/test-helper.js";
import { FIXED_NOW_MS, GOLDEN_TARGETS, seededRandom } from "../scripts/gen-goldens.mjs";

const TRANSCRIPTS_DIR = fileURLToPath(new URL("../fixtures/transcripts", import.meta.url));
const RECORDS_DIR = fileURLToPath(new URL("../fixtures/records", import.meta.url));

const scenarios = readdirSync(TRANSCRIPTS_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

describe("replay goldens — byte-identical reproduction", () => {
  it("covers both SPEC §12 M2 scenarios (quiet, findings)", () => {
    expect(scenarios.sort()).toEqual(["findings", "quiet"]);
  });

  for (const name of scenarios) {
    it(`${name}: replaying the transcript reproduces the committed record byte-for-byte`, async () => {
      const transcript = JSON.parse(readFileSync(`${TRANSCRIPTS_DIR}/${name}.json`, "utf8")) as HttpTranscript;
      const golden = readFileSync(`${RECORDS_DIR}/${name}.json`, "utf8");

      const replayed = await buildRun({
        targets: GOLDEN_TARGETS,
        targetsHash: "golden-targets-hash",
        probe: createReplayHttpProbe(transcript),
        now: () => FIXED_NOW_MS,
        random: seededRandom(42),
        commit: "9".repeat(40),
        watchVersion: "0.1.0-alpha.0",
        checkPackVersion: "1",
        pricingManifest: "pricing.2026-08-08.json",
        pricing: TEST_PRICING_MANIFEST,
        kind: "scheduled",
        scheduledFor: "2026-08-08T15:00:00.000Z",
        trigger: {
          workflow: "watch.yml",
          runUrl: "https://github.com/jamessuuu/dogwatch/actions/runs/1",
          actor: "github-actions[bot]",
        },
        prevRecord: null,
      });

      expect(canonicalStringify(replayed)).toBe(golden);
    });

    it(`${name}: the committed golden is itself a rubric-clean record (--rerun-rules)`, () => {
      const raw: unknown = JSON.parse(readFileSync(`${RECORDS_DIR}/${name}.json`, "utf8"));
      const parsed = RunRecordSchema.parse(raw);
      expect(verifyRecord(parsed, { rerunRules: true })).toEqual([]);
    });
  }

  it("quiet.json has zero findings and a populated absence-of-evidence section", () => {
    const record = JSON.parse(readFileSync(`${RECORDS_DIR}/quiet.json`, "utf8")) as { findings: unknown[]; absenceOfEvidence: { statement: string } };
    expect(record.findings).toHaveLength(0);
    expect(record.absenceOfEvidence.statement.length).toBeGreaterThan(0);
  });

  it("findings.json has at least one confirmed high-severity finding (the planted 503)", () => {
    const record = JSON.parse(readFileSync(`${RECORDS_DIR}/findings.json`, "utf8")) as {
      findings: { severity: string; status: string }[];
    };
    expect(record.findings.length).toBeGreaterThan(0);
    expect(record.findings[0]?.severity).toBe("high");
    expect(record.findings[0]?.status).toBe("confirmed");
  });
});
