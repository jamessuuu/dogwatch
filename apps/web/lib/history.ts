/**
 * The published history, aggregated across EVERY committed run record.
 *
 * Why this file exists (2026-09-07): the landing page rendered the latest
 * run's single summary line and nothing else, while `runs/2026/` held a
 * month of them. Twenty-three nights of measured operation — the coverage
 * curve, the response-time series, the cost line, the hash chain, the
 * nights that did NOT happen — were on disk and invisible. That history is
 * the product's only real proof; a single latest-run line is a claim.
 *
 * Everything here is computed at BUILD time from the committed JSON, in the
 * same server-only module graph as `data.ts` (SPEC §10: the site is fully
 * static, no route handler, no runtime fs, no fetch). A page that fetched
 * its own history could deploy green and render empty.
 *
 * Honesty rules this module enforces in code rather than in prose:
 *  - The cadence is NOT unbroken and this must never say it is. Seven
 *    nights in the span published nothing (`missingDays`), and the reason
 *    is recorded in watch.yml's own STATUS block. `longestStreak` is
 *    computed, never rounded up to the span.
 *  - `distinctFindings` counts by fingerprint, so a finding that recurs on
 *    23 consecutive nights is ONE finding, not 47. The naive sum is kept
 *    as `findingRecords` and labelled as such.
 *  - Nothing is inferred. Every field traces to a value in a committed
 *    record; where a record has no metric, the point is `null` and the
 *    chart leaves a hole rather than interpolating one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "../../../packages/dogwatch/dist/index.js";
import { loadRunIndex, repoRoot } from "./data";
import { RunRecordSchema } from "../../../packages/dogwatch/dist/index.js";

const MS_PER_DAY = 86_400_000;

export interface NightPoint {
  runId: string;
  /** YYYY-MM-DD of `startedAt`. */
  day: string;
  startedAt: string;
  kind: RunRecord["kind"];
  checks: number;
  passes: number;
  skips: number;
  findings: number;
  errors: number;
  gatesOpened: number;
  costMicroUsd: number;
  quiet: boolean;
  /** Wall-clock duration of the run, ms. */
  durationMs: number;
  /** `response_time_ms` for the one live target, or `null` if the record
   * carries no such metric. Never interpolated. */
  responseMs: number | null;
  recordHash: string;
  prevRecordHash: string | null;
  llmCalls: number;
  auditEvents: number;
  /** Checks the record explicitly declares it did NOT run, with a reason. */
  notChecked: number;
  checksClean: number;
}

export interface History {
  nights: NightPoint[];
  /** The oldest and newest published nights. Non-null: `loadHistory()`
   * throws on an empty index rather than handing every consumer an
   * optional it would only ever guard with a non-null assertion. A build
   * with no committed records SHOULD fail loudly — same principle as the
   * schema parse in `data.ts`. */
  first: NightPoint;
  latest: NightPoint;
  runCount: number;
  /** Distinct calendar days with at least one published record. */
  nightCount: number;
  firstDay: string;
  lastDay: string;
  /** Calendar days from first to last, inclusive. */
  spanDays: number;
  /** Days inside the span that published nothing. The gap is real and is
   * shown, not smoothed over. */
  missingDays: string[];
  longestStreak: number;
  scheduledCount: number;
  manualCount: number;
  quietCount: number;
  totalChecks: number;
  totalPasses: number;
  totalSkips: number;
  /** Sum of per-run `findings` — the same finding recurring nightly is
   * counted once PER NIGHT here. Use `distinctFindings` for "how many
   * problems". */
  findingRecords: number;
  distinctFindings: number;
  totalErrors: number;
  totalGates: number;
  totalCostMicroUsd: number;
  totalLlmCalls: number;
  totalAuditEvents: number;
  /** Verified links in the cross-run hash chain (runCount - 1 when whole). */
  chainLinks: number;
  chainIntact: boolean;
  responseMs: { min: number; max: number; mean: number; count: number } | null;
}

function loadRecord(path: string): RunRecord {
  return RunRecordSchema.parse(JSON.parse(readFileSync(join(repoRoot(), path), "utf8")) as unknown);
}

export function loadHistory(): History {
  const index = loadRunIndex();
  const entries = index.runs;

  const nights: NightPoint[] = entries.map((entry) => {
    const record = loadRecord(entry.path);
    const responseMetric = record.metrics.find((m) => m.name === "response_time_ms");
    return {
      runId: entry.runId,
      day: entry.startedAt.slice(0, 10),
      startedAt: entry.startedAt,
      kind: record.kind,
      checks: entry.checksTotal,
      passes: entry.passes,
      skips: entry.skips,
      findings: entry.findings,
      errors: entry.errors,
      gatesOpened: entry.gatesOpened,
      costMicroUsd: entry.costMicroUsd,
      quiet: entry.quiet,
      durationMs: Date.parse(entry.endedAt) - Date.parse(entry.startedAt),
      responseMs: responseMetric === undefined ? null : responseMetric.value,
      recordHash: entry.recordHash,
      prevRecordHash: record.chain.prevRecordHash,
      llmCalls: record.llm.calls,
      auditEvents: record.audit.events.length,
      notChecked: record.absenceOfEvidence.notChecked.length,
      checksClean: record.absenceOfEvidence.checksClean,
    };
  });

  const first = nights[0];
  const latest = nights.at(-1);
  if (first === undefined || latest === undefined) {
    throw new Error("history.ts: runs/index.json published no records — nothing to render.");
  }

  const days = [...new Set(nights.map((n) => n.day))].sort();
  const firstDay = days[0] ?? "";
  const lastDay = days.at(-1) ?? "";
  const spanDays =
    days.length === 0 ? 0 : Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / MS_PER_DAY) + 1;

  const daySet = new Set(days);
  const missingDays: string[] = [];
  for (let t = Date.parse(firstDay); t <= Date.parse(lastDay); t += MS_PER_DAY) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!daySet.has(d)) missingDays.push(d);
  }

  let longestStreak = 0;
  let current = 0;
  let previous: string | null = null;
  for (const d of days) {
    current = previous !== null && Date.parse(d) - Date.parse(previous) === MS_PER_DAY ? current + 1 : 1;
    if (current > longestStreak) longestStreak = current;
    previous = d;
  }

  // Distinct findings by fingerprint, across every record ever published.
  const fingerprints = new Set<string>();
  for (const entry of entries) {
    for (const f of loadRecord(entry.path).findings) fingerprints.add(f.fingerprint);
  }

  // The cross-run chain: record N's `chain.prevRecordHash` must equal
  // record N-1's published `recordHash`. Checked here rather than asserted.
  let chainLinks = 0;
  let chainIntact = true;
  for (let i = 1; i < nights.length; i += 1) {
    const here = nights[i];
    const before = nights[i - 1];
    if (here === undefined || before === undefined) continue;
    if (here.prevRecordHash === before.recordHash) chainLinks += 1;
    else chainIntact = false;
  }

  const responseValues = nights.map((n) => n.responseMs).filter((v): v is number => v !== null);
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

  return {
    nights,
    first,
    latest,
    runCount: nights.length,
    nightCount: days.length,
    firstDay,
    lastDay,
    spanDays,
    missingDays,
    longestStreak,
    scheduledCount: nights.filter((n) => n.kind === "scheduled").length,
    manualCount: nights.filter((n) => n.kind === "manual").length,
    quietCount: nights.filter((n) => n.quiet).length,
    totalChecks: sum(nights.map((n) => n.checks)),
    totalPasses: sum(nights.map((n) => n.passes)),
    totalSkips: sum(nights.map((n) => n.skips)),
    findingRecords: sum(nights.map((n) => n.findings)),
    distinctFindings: fingerprints.size,
    totalErrors: sum(nights.map((n) => n.errors)),
    totalGates: sum(nights.map((n) => n.gatesOpened)),
    totalCostMicroUsd: sum(nights.map((n) => n.costMicroUsd)),
    totalLlmCalls: sum(nights.map((n) => n.llmCalls)),
    totalAuditEvents: sum(nights.map((n) => n.auditEvents)),
    chainLinks,
    chainIntact,
    responseMs:
      responseValues.length === 0
        ? null
        : {
            min: Math.min(...responseValues),
            max: Math.max(...responseValues),
            mean: Math.round(sum(responseValues) / responseValues.length),
            count: responseValues.length,
          },
  };
}

/** The watched surfaces, read from the committed `targets.json` the runner
 * itself uses — so the page cannot drift from what is actually watched. */
export interface Surface {
  id: string;
  name: string;
  url: string;
  repo: string;
  deployed: boolean;
  families: string[];
  note: string;
}

export function loadSurfaces(): Surface[] {
  const raw = readFileSync(join(repoRoot(), "targets.json"), "utf8");
  const parsed = JSON.parse(raw) as { sites: Surface[] };
  return parsed.sites;
}
