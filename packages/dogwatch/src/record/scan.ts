/** Node-only: read every committed run record under `runs/<year>/*.json`. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RunRecordSchema, type RunRecord } from "./schema.js";

export interface ScannedRecord {
  path: string;
  record: RunRecord;
}

export function scanRunRecords(runsDir: string): ScannedRecord[] {
  const out: ScannedRecord[] = [];
  let years: string[];
  try {
    years = readdirSync(runsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return out;
  }
  for (const year of years) {
    const dir = join(runsDir, year);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const path = join(dir, file);
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      const result = RunRecordSchema.safeParse(parsed);
      if (!result.success) {
        const detail = result.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        throw new Error(`${path} is not a valid run record (${detail})`);
      }
      out.push({ path, record: result.data });
    }
  }
  out.sort((a, b) => a.record.startedAt.localeCompare(b.record.startedAt));
  return out;
}

export function latestRunRecord(runsDir: string): RunRecord | null {
  const all = scanRunRecords(runsDir);
  return all.length === 0 ? null : (all[all.length - 1]?.record ?? null);
}
