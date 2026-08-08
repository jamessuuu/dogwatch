import type { RunRecord } from "./schema.js";
import type { RunIndexEntry, RunIndexFile } from "./index-schema.js";
import { computeRecordHash } from "./hash.js";
import { runRecordPath } from "./paths.js";

function relativeRunPath(runsDir: string, absPath: string): string {
  // Keep the committed index portable (relative to the repo root's runs/
  // dir), independent of the machine that generated it.
  const normalized = absPath.replaceAll("\\", "/");
  const marker = `${runsDir.replaceAll("\\", "/")}/`;
  const idx = normalized.indexOf(marker);
  return idx === -1 ? normalized : `runs/${normalized.slice(idx + marker.length)}`;
}

export function indexEntryOf(record: RunRecord, runsDir: string): RunIndexEntry {
  const passes = record.checks.filter((c) => c.verdict === "pass").length;
  const errors = record.checks.filter((c) => c.verdict === "error").length;
  const skips = record.checks.filter((c) => c.verdict === "skipped").length;
  const path = relativeRunPath(runsDir, runRecordPath(runsDir, record.startedAt, record.runId));
  return {
    runId: record.runId,
    path,
    kind: record.kind,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    checksTotal: record.checks.length,
    passes,
    findings: record.findings.length,
    skips,
    errors,
    gatesOpened: record.gates.length,
    costMicroUsd: record.cost.microUsd,
    quiet: record.findings.length === 0,
    recordHash: computeRecordHash(record),
  };
}

export function buildIndex(records: readonly RunRecord[], runsDir: string): RunIndexFile {
  const sorted = [...records].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { formatVersion: 1, runs: sorted.map((r) => indexEntryOf(r, runsDir)) };
}
