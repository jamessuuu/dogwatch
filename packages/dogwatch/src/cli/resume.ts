/**
 * `dogwatch resume` (SPEC §6/§5 step 5, §12 M5): sweep timeouts → claim
 * decided gates → execute exactly once → amend → close the notification
 * issue → regenerate `state/pending-gates.json`. The git-first fast path
 * ("reads state/pending-gates.json first and exits in ~5s touching nothing
 * when empty" — SPEC §5's Neon CU-hour argument) lives HERE, not only in
 * `resume.yml`'s own shell step, so `dogwatch resume` is cheap and correct
 * even invoked directly.
 */
import { readFileSync } from "node:fs";
import { createSluice, systemClock } from "@jamessuuu/sluice";
import type { Command } from "commander";
import { runResume } from "../effects/resume.js";
import { RunRecordSchema, type RunRecord } from "../record/schema.js";
import { buildIndex } from "../record/index-file.js";
import { runIndexPath } from "../record/paths.js";
import { buildPendingGatesFile, PendingGatesFileSchema } from "../record/pending-gates.js";
import { scanRunRecords } from "../record/scan.js";
import { writeJsonFileAtomic } from "../record/write.js";
import { createDogwatchStore } from "../store/index.js";
import { defaultRunsDir, repoRoot } from "./paths.js";
import { githubTransportFromEnv } from "./effects-config.js";
import { EXIT } from "./exit-codes.js";
import { join } from "node:path";

export function registerResumeCommand(program: Command): void {
  program
    .command("resume")
    .description("sweep gate timeouts, claim decided gates, execute approved actions exactly once, amend")
    .action(async () => {
      process.exit(await runResumeCommand());
    });
}

export async function runResumeCommand(): Promise<number> {
  const pendingGatesPath = join(repoRoot(), "state", "pending-gates.json");

  let pendingBefore: unknown;
  try {
    pendingBefore = JSON.parse(readFileSync(pendingGatesPath, "utf8"));
  } catch (cause) {
    console.error(`usage error: could not read ${pendingGatesPath}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT.USAGE;
  }
  const parsedPending = PendingGatesFileSchema.safeParse(pendingBefore);
  if (!parsedPending.success) {
    console.error(`usage error: ${pendingGatesPath} does not match its schema — run "dogwatch render" first`);
    return EXIT.USAGE;
  }
  if (parsedPending.data.gates.length === 0) {
    // SPEC §5: touch nothing — no store connection, no sluice call at all.
    console.log("dogwatch resume: state/pending-gates.json is empty. Nothing to do.");
    return EXIT.CLEAN;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const dogwatchStore = await createDogwatchStore({ databaseUrl });
  if (dogwatchStore.kind !== "postgres") {
    // A gate can only have been durably opened against Postgres in the
    // first place (M4/M5: propose.ts refuses store_unavailable otherwise) —
    // resuming against a fresh, empty MemoryStore would see nothing and
    // silently "succeed" at doing nothing, which is exactly the fail-silent
    // shape SPEC §9 forbids. Fail loud instead.
    await dogwatchStore.close();
    console.error(
      "dogwatch resume: DATABASE_URL is not configured (or unreachable) but state/pending-gates.json lists pending gates — refusing to silently no-op."
    );
    return EXIT.PROBE;
  }

  const githubTransport = githubTransportFromEnv();
  if (githubTransport === undefined) {
    await dogwatchStore.close();
    console.error("dogwatch resume: GITHUB_TOKEN is not configured — cannot execute or notify. Refusing to silently no-op.");
    return EXIT.USAGE;
  }

  const approvalSecret = process.env.APPROVAL_SECRET;
  const runsDir = defaultRunsDir();
  const sluice = createSluice({
    store: dogwatchStore.store,
    namespace: "dogwatch",
    owner: `dogwatch:resume:${String(process.pid)}:${String(Date.now())}`,
    clock: systemClock,
    ...(approvalSecret === undefined ? {} : { approvalSecret }),
  });

  function loadRecord(relativePath: string): RunRecord {
    const raw: unknown = JSON.parse(readFileSync(join(repoRoot(), relativePath), "utf8"));
    return RunRecordSchema.parse(raw);
  }
  function saveRecord(relativePath: string, record: RunRecord): void {
    writeJsonFileAtomic(join(repoRoot(), relativePath), record);
  }

  let summary;
  try {
    summary = await runResume({ sluice, githubTransport, loadRecord, saveRecord, now: () => Date.now() });
  } finally {
    await dogwatchStore.close();
  }

  console.log(
    `dogwatch resume: swept ${String(summary.sweptTimeouts)} timeout(s), claimed ${String(summary.claimed)} decided gate(s).`
  );
  for (const r of summary.results) {
    console.log(`  ${r.gateId} (${r.recordPath}) -> ${r.outcome}`);
  }

  // Regenerate both committed artifacts unconditionally: an amendment never
  // changes chain.recordHash, but a gate that just resolved must disappear
  // from state/pending-gates.json — gap-checked so this genuinely reflects
  // the amendments this run just wrote to disk.
  const records = scanRunRecords(runsDir).map((s) => s.record);
  writeJsonFileAtomic(runIndexPath(runsDir), buildIndex(records, runsDir));
  writeJsonFileAtomic(pendingGatesPath, buildPendingGatesFile(records));

  return EXIT.CLEAN;
}
