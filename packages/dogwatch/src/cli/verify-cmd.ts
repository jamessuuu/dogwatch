import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { RunRecordSchema, type RunRecord } from "../record/schema.js";
import { scanRunRecords } from "../record/scan.js";
import { verifyRecord } from "../verify/rubric.js";
import { defaultRunsDir } from "./paths.js";
import { EXIT } from "./exit-codes.js";

interface VerifyCliOptions {
  all?: boolean;
  rerunRules?: boolean;
  offline?: boolean;
}

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify")
    .description("the rubric validator + rule re-derivation + chain verification (SPEC §7)")
    .argument("[records...]", "run-record JSON files to verify")
    .option("--all", "verify every record under runs/")
    .option("--rerun-rules", "also re-derive every finding from stored evidence (R13)")
    .option("--offline", "no-op — dogwatch verify never touches the network")
    .action((records: string[], opts: VerifyCliOptions) => {
      process.exit(runVerify(records, opts));
    });
}

function readRecord(path: string): RunRecord {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const result = RunRecordSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`${path} is not a valid run record (${detail})`);
  }
  return result.data;
}

export function runVerify(recordArgs: string[], opts: VerifyCliOptions): number {
  let entries: { path: string; record: RunRecord; prevRecord: RunRecord | null }[];

  try {
    if (opts.all === true) {
      const scanned = scanRunRecords(defaultRunsDir());
      entries = scanned.map((s, i) => ({
        path: s.path,
        record: s.record,
        prevRecord: i === 0 ? null : (scanned[i - 1]?.record ?? null),
      }));
    } else {
      if (recordArgs.length === 0) {
        console.error("usage error: pass one or more record paths, or --all");
        return EXIT.USAGE;
      }
      entries = recordArgs.map((path) => ({ path, record: readRecord(path), prevRecord: null }));
    }
  } catch (cause) {
    console.error(`usage error: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT.USAGE;
  }

  if (entries.length === 0) {
    console.log("no records to verify.");
    return EXIT.CLEAN;
  }

  let anyViolation = false;
  for (const entry of entries) {
    const violations = verifyRecord(entry.record, {
      rerunRules: opts.rerunRules === true,
      prevRecord: entry.prevRecord,
    });
    if (violations.length === 0) {
      console.log(`ok   ${entry.path}`);
      continue;
    }
    anyViolation = true;
    console.log(`FAIL ${entry.path}`);
    for (const v of violations) {
      console.log(`  ${v.rule} ${v.code}: ${v.message}`);
    }
  }

  return anyViolation ? EXIT.RUBRIC : EXIT.CLEAN;
}
