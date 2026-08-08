import type { Command } from "commander";
import { createAnthropicLlmClient } from "../llm/client.js";
import { createBudgetStore, DEFAULT_BUDGET_CAPS } from "../llm/budget.js";
import { createUndiciHttpProbe } from "../probe/http.js";
import { buildIndex } from "../record/index-file.js";
import { currentGitCommit } from "../record/git.js";
import { canonicalStringify } from "../record/canonical.js";
import { loadPricingManifest } from "../record/pricing-io.js";
import { runIndexPath, runRecordPath } from "../record/paths.js";
import { scanRunRecords, latestRunRecord } from "../record/scan.js";
import { FamilySchema } from "../record/schema.js";
import { loadTargets } from "../record/targets-io.js";
import { writeJsonFileAtomic } from "../record/write.js";
import { buildRun } from "../record/build-run.js";
import { createDogwatchStore } from "../store/index.js";
import { createPgPoolSqlExecutor } from "../store/sql-executor.js";
import { defaultPricingManifestPath, defaultRunsDir, defaultTargetsPath, repoRoot } from "./paths.js";
import { restrictToFamily } from "./family-filter.js";
import { buildTrigger } from "./trigger.js";
import { EXIT } from "./exit-codes.js";
import { CHECK_PACK_VERSION, DOGWATCH_VERSION } from "./version.js";

interface WatchCliOptions {
  dryRun?: boolean;
  only?: string;
  targets?: string;
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("probe the six targets, build the run record, publish it")
    .option("--dry-run", "no store writes, no commit, no gates — print the record")
    .option("--only <family>", "restrict to one check family")
    .option("--targets <file>", "path to targets.json")
    .action(async (opts: WatchCliOptions) => {
      const code = await runWatch(opts);
      process.exit(code);
    });
}

export async function runWatch(opts: WatchCliOptions): Promise<number> {
  const targetsPath = opts.targets ?? defaultTargetsPath();
  const runsDir = defaultRunsDir();

  let loaded: ReturnType<typeof loadTargets>;
  try {
    loaded = loadTargets(targetsPath);
  } catch (cause) {
    console.error(`usage error: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT.USAGE;
  }

  let targets = loaded.targets;
  if (opts.only !== undefined) {
    const parsedFamily = FamilySchema.safeParse(opts.only);
    if (!parsedFamily.success) {
      console.error(`usage error: "${opts.only}" is not a known check family`);
      return EXIT.USAGE;
    }
    targets = restrictToFamily(targets, parsedFamily.data);
  }

  let pricing: ReturnType<typeof loadPricingManifest>;
  try {
    pricing = loadPricingManifest(defaultPricingManifestPath());
  } catch (cause) {
    console.error(`usage error: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT.USAGE;
  }

  // M3 advisory LLM (SPEC §8): only constructed when a real key is present.
  // James has not approved spend — a `dogwatch watch` run with no
  // ANTHROPIC_API_KEY set (every local/dev invocation, and CI unless the
  // secret is explicitly wired) degrades the advisory pipeline honestly
  // rather than ever constructing a real client. CRITICAL: no live API
  // call anywhere in this build's tests or default behavior.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const llmClient = apiKey === undefined || apiKey.length === 0 ? undefined : createAnthropicLlmClient(apiKey);

  const prevRecord = latestRunRecord(runsDir);

  // M4 (SPEC §3/§9): DATABASE_URL alone decides whether this run attempts
  // Postgres at all. `createDogwatchStore` never throws — an unreachable
  // Neon degrades to MemoryStore (fail closed, never fail silent) rather
  // than crashing the whole nightly run. Every local/dev/CI invocation with
  // nothing set behaves exactly as it did pre-M4 (in-memory, unanchored).
  const databaseUrl = process.env.DATABASE_URL;
  const dogwatchStore = await createDogwatchStore({ databaseUrl });
  const budgetStore =
    dogwatchStore.kind === "postgres" && dogwatchStore.pool !== undefined && databaseUrl !== undefined
      ? createBudgetStore({ databaseUrl, sqlExecutor: createPgPoolSqlExecutor(dogwatchStore.pool) })
      : undefined;

  let record;
  try {
    record = await buildRun({
      targets,
      targetsHash: loaded.targetsHash,
      probe: createUndiciHttpProbe(),
      now: () => Date.now(),
      random: () => Math.random(),
      commit: currentGitCommit(repoRoot()),
      watchVersion: DOGWATCH_VERSION,
      checkPackVersion: CHECK_PACK_VERSION,
      pricingManifest: "pricing.2026-08-08.json",
      pricing,
      llmClient,
      budgetStore,
      budgetCaps: DEFAULT_BUDGET_CAPS,
      kind: "manual",
      scheduledFor: null,
      trigger: buildTrigger(),
      prevRecord,
      store: dogwatchStore.store,
      storeKind: dogwatchStore.kind,
      ...(dogwatchStore.degradeReason === undefined ? {} : { storeDegradeReason: dogwatchStore.degradeReason }),
    });
  } catch (cause) {
    console.error(`internal error building the run: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
    return EXIT.INTERNAL;
  } finally {
    await dogwatchStore.close();
  }

  if (opts.dryRun === true) {
    console.log(canonicalStringify(record));
    return exitForRecord(record);
  }

  const filePath = runRecordPath(runsDir, record.startedAt, record.runId);
  writeJsonFileAtomic(filePath, record);
  const allRecords = scanRunRecords(runsDir).map((s) => s.record);
  writeJsonFileAtomic(runIndexPath(runsDir), buildIndex(allRecords, runsDir));

  const passes = record.checks.filter((c) => c.verdict === "pass").length;
  const skips = record.checks.filter((c) => c.verdict === "skipped").length;
  const errors = record.checks.filter((c) => c.verdict === "error").length;
  console.log(
    `dogwatch ${record.runId}: ${String(record.checks.length)} checks (${String(passes)} pass, ${String(record.findings.length)} finding, ${String(skips)} skipped, ${String(errors)} error) -> ${filePath}`
  );
  return exitForRecord(record);
}

function exitForRecord(record: Awaited<ReturnType<typeof buildRun>>): number {
  if (record.findings.length > 0) return EXIT.FINDINGS;
  if (record.checks.length > 0 && record.checks.every((c) => c.verdict === "error")) return EXIT.PROBE;
  return EXIT.CLEAN;
}
