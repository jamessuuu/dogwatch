import type { Command } from "commander";
import { z } from "zod";
import { buildIndex } from "../record/index-file.js";
import { canonicalStringify } from "../record/canonical.js";
import { runIndexPath } from "../record/paths.js";
import { scanRunRecords } from "../record/scan.js";
import { readJsonFileIfExists, writeJsonFileAtomic } from "../record/write.js";
import { defaultRunsDir, repoRoot } from "./paths.js";
import { EXIT } from "./exit-codes.js";
import { join } from "node:path";

const PendingGatesFileSchema = z.strictObject({
  formatVersion: z.literal(1),
  gates: z.array(z.unknown()),
});

interface RenderCliOptions {
  check?: boolean;
}

export function registerRenderCommand(program: Command): void {
  program
    .command("render")
    .description("regenerate runs/index.json + state/pending-gates.json")
    .option("--check", "diff against the committed output instead of writing (CI drift gate)")
    .action((opts: RenderCliOptions) => {
      process.exit(runRender(opts));
    });
}

export function runRender(opts: RenderCliOptions): number {
  const runsDir = defaultRunsDir();
  const records = scanRunRecords(runsDir).map((s) => s.record);
  const index = buildIndex(records, runsDir);
  const indexPath = runIndexPath(runsDir);
  const indexText = canonicalStringify(index);

  const pendingGatesPath = join(repoRoot(), "state", "pending-gates.json");
  // No gates exist before M5 (SPEC §12) — an empty, well-formed file is the
  // honest state, not a placeholder.
  const pendingGates = PendingGatesFileSchema.parse({ formatVersion: 1, gates: [] });
  const pendingGatesText = canonicalStringify(pendingGates);

  if (opts.check === true) {
    const existingIndex = readJsonFileIfExists(indexPath);
    const existingGates = readJsonFileIfExists(pendingGatesPath);
    const indexDrifted = existingIndex === undefined || canonicalStringify(existingIndex) !== indexText;
    const gatesDrifted = existingGates === undefined || canonicalStringify(existingGates) !== pendingGatesText;
    if (indexDrifted || gatesDrifted) {
      console.error("runs/index.json or state/pending-gates.json is out of date. Run \"dogwatch render\".");
      return EXIT.RUBRIC;
    }
    console.log("runs/index.json and state/pending-gates.json are up to date.");
    return EXIT.CLEAN;
  }

  writeJsonFileAtomic(indexPath, index);
  writeJsonFileAtomic(pendingGatesPath, pendingGates);
  console.log(`wrote ${indexPath}`);
  console.log(`wrote ${pendingGatesPath}`);
  return EXIT.CLEAN;
}
