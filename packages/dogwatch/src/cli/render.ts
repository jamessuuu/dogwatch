import type { Command } from "commander";
import { buildIndex } from "../record/index-file.js";
import { canonicalStringify } from "../record/canonical.js";
import { runIndexPath } from "../record/paths.js";
import { buildPendingGatesFile } from "../record/pending-gates.js";
import { scanRunRecords } from "../record/scan.js";
import { readJsonFileIfExists, writeJsonFileAtomic } from "../record/write.js";
import { defaultRunsDir, repoRoot } from "./paths.js";
import { EXIT } from "./exit-codes.js";
import { join } from "node:path";

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
  // M5 (SPEC §5): every gate with an EFFECTIVE status of "pending" across
  // every committed record (a gate resolved via amendment is no longer
  // pending, even though its base-record entry still says so — see
  // pending-gates.ts's header comment). Empty before any gate has ever
  // opened (M0-M4) — a well-formed empty file, not a placeholder.
  const pendingGates = buildPendingGatesFile(records);
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
