/**
 * Server-only data loading (SPEC §10): every page is prerendered from
 * committed JSON. All reads happen at `next build` time (this is a fully
 * static site — no route handler, no runtime fs access) via the SAME Zod
 * schemas `dogwatch verify` uses, so a malformed committed record fails the
 * BUILD rather than rendering silently wrong.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Relative import to the COMPILED package, not the bare "dogwatch"
// specifier — see next.config.ts's doc comment for why: Next's bundler
// cannot transpile the package's raw NodeNext-resolution TypeScript source
// (its `exports` field points at `./src/index.ts` for `tsc`'s own use, per
// SPEC §4 — dogwatch is never published), so this file imports the same
// build output `pnpm --filter dogwatch build` already produces.
import {
  CHECK_REGISTRY,
  PendingGatesFileSchema,
  RunIndexFileSchema,
  RunRecordSchema,
  type Check,
  type FamilyCatalogEntry,
  type PendingGateEntry,
  type RunIndexEntry,
  type RunIndexFile,
  type RunRecord,
} from "../../../packages/dogwatch/dist/index.js";

export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/web/lib -> repo root
  return resolve(here, "..", "..", "..");
}

export function loadRunIndex(): RunIndexFile {
  const raw = readFileSync(join(repoRoot(), "runs", "index.json"), "utf8");
  return RunIndexFileSchema.parse(JSON.parse(raw) as unknown);
}

/** M5: `/gate` reads this committed, tokenless file to render a pending
 * gate's basic facts (SPEC §5: "open gates (from the committed file,
 * tokenless)") — no server call, no Postgres read, for the page shell
 * itself; only the Approve/Reject POST touches `/api/gate/decide`. */
export function findPendingGate(gateId: string): PendingGateEntry | null {
  const raw = readFileSync(join(repoRoot(), "state", "pending-gates.json"), "utf8");
  const file = PendingGatesFileSchema.parse(JSON.parse(raw) as unknown);
  return file.gates.find((g) => g.gateId === gateId) ?? null;
}

export interface LoadedRun {
  record: RunRecord;
  raw: string;
  entry: RunIndexEntry;
}

export function loadRunRecord(runId: string): LoadedRun {
  const index = loadRunIndex();
  const entry = index.runs.find((r) => r.runId === runId);
  if (entry === undefined) throw new Error(`data.ts: no run record for id ${runId}`);
  const raw = readFileSync(join(repoRoot(), entry.path), "utf8");
  const record = RunRecordSchema.parse(JSON.parse(raw) as unknown);
  return { record, raw, entry };
}

/** Chronological (index-file.ts's own ordering: oldest first). */
export function loadAllRunIds(): string[] {
  return loadRunIndex().runs.map((r) => r.runId);
}

/** The latest published run — `null` only if the site is built before any
 * run has ever been committed (never true for this repo, but the type
 * stays honest about it rather than asserting non-null). */
export function loadLatestRun(): LoadedRun | null {
  const index = loadRunIndex();
  const entry = index.runs.at(-1);
  if (entry === undefined) return null;
  return loadRunRecord(entry.runId);
}

export function loadRunsNewestFirst(): RunIndexEntry[] {
  return [...loadRunIndex().runs].reverse();
}

/** The landing page's live excerpt (SPEC §10 `/`) needs a record with an
 * actual finding to show — not a fabricated one (R13's whole point). Picks
 * the newest run that has one; falls back to the newest run overall on a
 * history that is quiet end to end, same fallback the e2e suite uses
 * (`apps/web/e2e/smoke.spec.ts`'s `runWithFindings`). */
export function loadRunWithFindings(): LoadedRun | null {
  const index = loadRunIndex();
  const entry = [...index.runs].reverse().find((r) => r.findings > 0) ?? index.runs.at(-1);
  if (entry === undefined) return null;
  return loadRunRecord(entry.runId);
}

/** The landing page's excerpt (SPEC §10 `/`) shows a handful of real
 * checks, not the whole record — one `pass` check per distinct family, up
 * to `max`, each with its own `curl` reproduce line. Never picks a
 * `skipped`/`error` check for this purpose: the excerpt's job is to show
 * the watch actually checking something, not the many `not_published`
 * entries a two-site-live program still has. */
export function pickRepresentativeChecks(record: RunRecord, max = 3): Check[] {
  const seen = new Set<string>();
  const picked: Check[] = [];
  for (const check of record.checks) {
    if (check.verdict !== "pass") continue;
    if (seen.has(check.family)) continue;
    seen.add(check.family);
    picked.push(check);
    if (picked.length >= max) break;
  }
  return picked;
}

/** Whether any published run has actually fired from the schedule
 * (`kind:"scheduled"`) rather than a manual `dogwatch watch` invocation or a
 * `kind:"gap"` record. Drives the landing page's honest status line (SPEC's
 * own README Status block makes the same claim) — computed from the
 * published index rather than hand-maintained, so the claim corrects itself
 * the moment a real scheduled run lands instead of silently going stale. */
export function hasScheduledRun(): boolean {
  return loadRunIndex().runs.some((r) => r.kind === "scheduled");
}

export function checksCatalog(): readonly FamilyCatalogEntry[] {
  return CHECK_REGISTRY;
}

const GITHUB_REPO = "jamessuuu/dogwatch";

export function githubBlobUrl(commit: string, relativePath: string): string {
  return `https://github.com/${GITHUB_REPO}/blob/${commit}/${relativePath.replaceAll("\\", "/")}`;
}

export function githubRepoUrl(): string {
  return `https://github.com/${GITHUB_REPO}`;
}

/** Used only by the e2e suite's tampered-fixture scenario (SPEC §11.6: "the
 * Verify button turns... red on a tampered fixture") — reads a fixture from
 * `fixtures/violations/` the same way a run record is read, so the smoke
 * test can render a real page against evidence that fails verification on
 * purpose. Not linked from anywhere a real visitor navigates. */
export function loadViolationFixture(name: string): { record: RunRecord; raw: string } {
  const path = join(repoRoot(), "fixtures", "violations", `${name}.json`);
  const raw = readFileSync(path, "utf8");
  const record = RunRecordSchema.parse(JSON.parse(raw) as unknown);
  return { record, raw };
}

export function listViolationFixtureNames(): string[] {
  return readdirSync(join(repoRoot(), "fixtures", "violations"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
