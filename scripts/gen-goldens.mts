// Generates fixtures/transcripts/*.json (recorded HTTP fixtures) and
// fixtures/records/*.json (the frozen-clock, seeded-id output of replaying
// them through the REAL pipeline) — SPEC §11.3: "recorded probe transcripts
// replayed through the real pipeline with a frozen clock and seeded ids,
// asserting a byte-identical record." Two of the four SPEC scenarios land
// in M2 (quiet, findings); "gated" needs M5's gate machinery and
// "degraded/no-store" needs M4's Postgres failure path — both out of scope
// here (task instruction), so their transcripts are not generated.
//
// Run: `pnpm exec tsx scripts/gen-goldens.mts`. Committed output;
// evals/replay.eval.test.ts re-runs the SAME buildRun call over the
// committed transcript and asserts byte-for-byte equality with the
// committed record — this script and that test must stay parameter-aligned
// (FIXED_NOW_MS, the seeded random, the target shape).
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { canonicalStringify } from "../packages/dogwatch/src/record/canonical.js";
import { buildRun } from "../packages/dogwatch/src/record/build-run.js";
import { createReplayHttpProbe, type HttpTranscript } from "../packages/dogwatch/src/probe/replay.js";
import type { TargetsFile } from "../packages/dogwatch/src/record/targets-schema.js";

export const FIXED_NOW_MS = Date.parse("2026-08-08T15:00:00.000Z");
/** A trivial, deterministic PRNG — good enough for a fixed replay fixture
 * (not a security use), and identical across every invocation. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export const GOLDEN_TARGETS: TargetsFile = {
  formatVersion: 1,
  sites: [
    {
      id: "tiltmeter",
      name: "tiltmeter",
      url: "https://tiltmeter.vercel.app",
      repo: "jamessuuu/tiltmeter",
      deployed: false,
      families: ["reach"],
      expectedHeaders: [],
      weightBudgetBytes: 300_000,
      note: "not yet deployed",
    },
    {
      id: "agentjames",
      name: "Agent James",
      url: "https://agentjames.vercel.app",
      repo: "jamessuuu/agentjames",
      deployed: true,
      families: ["reach"],
      expectedHeaders: [],
      weightBudgetBytes: 300_000,
    },
  ],
  repos: [],
  packages: [],
  artifacts: [],
  actionPolicy: { issueRepos: ["jamessuuu/dogwatch"], confirmations: 2, gateTimeoutHours: 48 },
};

const TRANSCRIPTS_DIR = fileURLToPath(new URL("../fixtures/transcripts", import.meta.url));
const RECORDS_DIR = fileURLToPath(new URL("../fixtures/records", import.meta.url));

const SCENARIOS: { name: string; transcript: HttpTranscript }[] = [
  {
    name: "quiet",
    transcript: {
      get: {
        "https://agentjames.vercel.app": {
          status: 200,
          finalUrl: "https://agentjames.vercel.app",
          redirects: [],
          headers: { "strict-transport-security": "max-age=63072000; includeSubDomains; preload" },
          bodyText: "<!doctype html><html><body>Agent James</body></html>",
          bodyTruncated: false,
          bytes: 54,
          ms: 120,
          bodySha256: "a".repeat(64),
        },
      },
    },
  },
  {
    name: "findings",
    transcript: {
      get: {
        "https://agentjames.vercel.app": {
          status: 503,
          finalUrl: "https://agentjames.vercel.app",
          redirects: [],
          headers: {},
          bodyText: "",
          bodyTruncated: false,
          bytes: 0,
          ms: 45,
          bodySha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
      },
    },
  },
];

async function main() {
  mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  mkdirSync(RECORDS_DIR, { recursive: true });
  for (const { name, transcript } of SCENARIOS) {
    writeFileSync(`${TRANSCRIPTS_DIR}/${name}.json`, canonicalStringify(transcript), "utf8");

    const record = await buildRun({
      targets: GOLDEN_TARGETS,
      targetsHash: "golden-targets-hash",
      probe: createReplayHttpProbe(transcript),
      now: () => FIXED_NOW_MS,
      random: seededRandom(42),
      commit: "9".repeat(40),
      watchVersion: "0.1.0-alpha.0",
      checkPackVersion: "1",
      pricingManifest: "pricing.2026-08-08.json",
      kind: "scheduled",
      scheduledFor: "2026-08-08T15:00:00.000Z",
      trigger: { workflow: "watch.yml", runUrl: "https://github.com/jamessuuu/dogwatch/actions/runs/1", actor: "github-actions[bot]" },
      prevRecord: null,
    });
    writeFileSync(`${RECORDS_DIR}/${name}.json`, canonicalStringify(record), "utf8");
    console.log(`wrote fixtures/transcripts/${name}.json + fixtures/records/${name}.json`);
  }
}

// Only run when invoked directly (`tsx scripts/gen-goldens.mts`) — this
// module is also imported by evals/replay.eval.test.ts purely for its
// exported constants (FIXED_NOW_MS, seededRandom, GOLDEN_TARGETS), and an
// eval run must never have the side effect of rewriting the fixtures it is
// verifying.
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  await main();
}
