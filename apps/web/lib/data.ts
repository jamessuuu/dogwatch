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
