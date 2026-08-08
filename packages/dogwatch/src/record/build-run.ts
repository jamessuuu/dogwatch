/**
 * Top-level run-record builder (SPEC §3/§4). Owns runId/clock/sluice setup,
 * fans out to `buildSiteChecks` per target, turns `finding`-verdict checks
 * into `Finding` rows with hysteresis applied, and assembles the audit /
 * cost / llm / chain blocks. `dogwatch watch` and the replay-golden harness
 * both call this same function — a live probe or a replay probe is the only
 * difference (SPEC §11).
 */
import { createSluice, MemoryStore, systemClock, type Clock, type Sluice, type SluiceStore } from "@jamessuuu/sluice";
import { RULES_BY_ID, WATCH_CHAIN_GAP, type ChainGapBaseline } from "../checks/index.js";
import { InMemoryBudgetStore, runAdvisoryPipeline, type BudgetCaps, type BudgetStore, type LlmClient } from "../llm/index.js";
import { buildAbsenceOfEvidence } from "./absence.js";
import { toAuditEventRecord } from "./audit-event.js";
import { buildSiteChecks } from "./build-site.js";
import { computeRecordHash } from "./hash.js";
import { checkId, findingFingerprint, findingId, newRunId } from "./ids.js";
import { resolveHysteresis } from "./hysteresis.js";
import { reproduceCurl } from "./reproduce.js";
import type { PricingManifest } from "./pricing-schema.js";
import { wrapProbeWithSluice } from "./sluice-probe.js";
import type {
  Action,
  AuditStoreKind,
  Check,
  DegradedEntry,
  Finding,
  GateEntry,
  Metric,
  Refusal,
  RunKind,
  RunRecord,
  Trigger,
} from "./schema.js";
import type { HttpProbe } from "../probe/types.js";
import type { TargetsFile } from "./targets-schema.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * sluice's own default `maxResultBytes` (64 KiB, sized for typical
 * idempotent-effect payloads) is far smaller than a probed HTML page —
 * `src/probe/http.ts`'s own truncation cap is 2 MB (`DEFAULT_MAX_BODY_BYTES`).
 * Above the limit sluice does not fail; it silently sets
 * `resultOmitted: true` and `outcome.value` becomes `undefined` (SPEC §5's
 * "≤512 KB record" truncation convention is a DIFFERENT, later cap on the
 * published record, not this one). Without raising this, any probed page
 * larger than 64 KB — agentjames.vercel.app's homepage is ~84 KB — would
 * crash `buildSiteChecks` reading `.finalUrl` off `undefined`. Sized above
 * the probe's own 2 MB body cap plus canonical-JSON escaping overhead.
 */
const SLUICE_MAX_RESULT_BYTES = 4_000_000;

export interface BuildRunOptions {
  targets: TargetsFile;
  targetsHash: string;
  probe: HttpProbe;
  now: () => number;
  random: () => number;
  commit: string;
  watchVersion: string;
  checkPackVersion: string;
  pricingManifest: string;
  /** The parsed numbers behind `pricingManifest`'s filename (SPEC §8: "every
   * price comes from pricing.<date>.json, never a constant") — required
   * even on a quiet run, since the field is needed to label `cost.method`. */
  pricing: PricingManifest;
  kind: RunKind;
  scheduledFor: string | null;
  trigger: Trigger;
  prevRecord: RunRecord | null;
  namespace?: string;
  timeoutMs?: number;
  /** M3 advisory LLM (SPEC §8). Undefined ⇒ no credentials configured — the
   * advisory pipeline degrades honestly rather than skipping silently. */
  llmClient?: LlmClient | undefined;
  /** Defaults to a fresh `InMemoryBudgetStore` per call — correct for a CLI
   * invocation that runs once and exits (SPEC's own M0-M3 sequencing note:
   * Neon-backed persistence lands at M4). */
  budgetStore?: BudgetStore | undefined;
  budgetCaps?: BudgetCaps | undefined;
  llmModel?: string | undefined;
  llmTimeoutMs?: number | undefined;
  /** M4 (SPEC §3/§9): the durable store to run effects against. Defaults to
   * a fresh `MemoryStore` — every existing caller (golden replay tests,
   * `--dry-run`, a contributor with no Neon configured) is byte-identical
   * to pre-M4 behavior when this is omitted. Production wiring
   * (`cli/watch.ts`) supplies the store `createDogwatchStore` returns. */
  store?: SluiceStore | undefined;
  /** Must match what produced `store` — determines whether this run's audit
   * trail is treated as cross-run-anchored (SPEC §3 Decision 2/§9). Defaults
   * to "memory". */
  storeKind?: AuditStoreKind | undefined;
  /** Present iff a database WAS configured but unreachable (SPEC §9's "Neon
   * suspended / over quota" row) — published into `degraded[]`. Absent for
   * the ordinary no-DATABASE_URL default, which is not itself a failure. */
  storeDegradeReason?: "store_unavailable" | undefined;
  /** M5 (SPEC §5 step 3): only needed if `proposeActions`'s hook mints
   * webhook tokens — passed straight through to the internally-constructed
   * `sluice` instance's own `approvalSecret` (required for
   * `gates.mintToken`/`gates.decide({token})` to work at all). */
  approvalSecret?: string | undefined;
  /** M5 (SPEC §5 steps 1-3): propose actions + open gates + notify, for
   * confirmed findings whose target is in `targets.actionPolicy.issueRepos`.
   * Undefined ⇒ every existing caller (golden replay tests, `--dry-run`
   * unit tests) is byte-identical to pre-M5 behavior: `actions: []`,
   * `gates: []`, `refusals: []`. Runs AFTER the advisory pipeline (SPEC's
   * own step ordering) and BEFORE this run's FINAL audit block is computed,
   * so gate-open audit events are captured in `record.audit.events` like
   * any other event this run produced. `cli/watch.ts` supplies the real
   * hook (`src/effects/propose.ts`'s `proposeAndGateFindings`, bound to a
   * real or fake `GithubTransport`); tests exercise `proposeAndGateFindings`
   * directly instead, or pass their own hook to test THIS wiring boundary. */
  proposeActions?:
    | ((ctx: {
        sluice: Sluice;
        checks: readonly Check[];
        findings: readonly Finding[];
        storeKind: AuditStoreKind;
        runId: string;
        startedAt: string;
        now: () => number;
      }) => Promise<{ actions: Action[]; gates: GateEntry[]; refusals: Refusal[] }>)
    | undefined;
}

export async function buildRun(options: BuildRunOptions): Promise<RunRecord> {
  const namespace = options.namespace ?? "dogwatch";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const store = options.store ?? new MemoryStore();
  const storeKind: AuditStoreKind = options.storeKind ?? "memory";
  const startedAtMs = options.now();
  const runId = newRunId(startedAtMs, options.random);
  const startedAt = new Date(startedAtMs).toISOString();

  const sluice = createSluice({
    store,
    namespace,
    // `now()` is the injected/frozen clock (SPEC §11: golden replay needs a
    // seeded, controllable timestamp for every record field). `sleep()` is
    // deliberately NOT frozen — it is sluice's OWN internal heartbeat/lease
    // timer, real wall-clock milliseconds regardless of what `now()` reports.
    // An earlier version of this stub made `sleep()` resolve instantly to
    // "skip" the heartbeat wait; that turns `execute()`'s
    // `for (;;) { await clock.sleep(interval, ...) }` heartbeat loop into a
    // synchronous busy-spin that starves the very probe call it is meant to
    // watch over. `systemClock.sleep` is sluice's own real-timer
    // implementation (SPEC §1 non-goal 4: no sluice reimplementation) —
    // reused here as-is.
    clock: {
      now: () => options.now(),
      sleep: (ms: number, signal?: AbortSignal) => systemClock.sleep(ms, signal),
    } satisfies Clock,
    random: options.random,
    owner: `dogwatch:${runId}`,
    maxResultBytes: SLUICE_MAX_RESULT_BYTES,
    ...(options.approvalSecret === undefined ? {} : { approvalSecret: options.approvalSecret }),
  });

  // SPEC §5 Neon wiring section, applied against MemoryStore (M0-M2): every
  // probe runs inside sluice.run() with circuitKey = host.
  const wrappedProbe = wrapProbeWithSluice(options.probe, sluice, runId);

  const allChecks: Check[] = [];
  const allMetrics: Metric[] = [];
  const observedAt = new Date(options.now()).toISOString();

  for (const site of options.targets.sites) {
    // Sites are probed sequentially by design (SPEC §5: one request, one
    // runner, one region, once a night — not a fan-out load generator).
    const { checks, metrics } = await buildSiteChecks(site, {
      probe: wrappedProbe,
      prevRecord: options.prevRecord,
      observedAt,
      timeoutMs,
    });
    allChecks.push(...checks);
    allMetrics.push(...metrics);
  }

  // ── audit peek: enough of this run's own event slice to detect
  // watch.chain_gap (SPEC §3/§9, M4) ──────────────────────────────────────
  // Computed here (before findings) so `watch.chain_gap` — a check like any
  // other — can be pushed into `allChecks` and flow through the SAME
  // findings-derivation loop below, rather than needing a second path. This
  // is deliberately NOT yet the run's FINAL audit block: the propose/gate
  // step (SPEC §5 steps 1-3) runs later and appends MORE events to the same
  // store, so the authoritative fromSeq/toSeq/head/events used in the
  // published record are recomputed again, below, after that step.
  //
  // For a fresh MemoryStore (storeKind "memory", the M0-M3 default) the
  // cursor is always 0: a brand-new store's own events start at seq 1
  // regardless of what a previous, unrelated run's record said. For a
  // shared, persistent Postgres store (storeKind "postgres"), anchoring the
  // query at `prevRecord.audit.toSeq` is what makes this run's audit.events
  // contain ONLY its own new activity rather than the store's entire
  // cross-run history back to genesis (SPEC §3 Decision 2's cross-run
  // chain — the whole point of M4).
  const startCursor = storeKind === "postgres" ? (options.prevRecord?.audit.toSeq ?? 0) : 0;
  const earlyEvents = (await sluice.audit.since({ namespace, seq: startCursor }, 100_000)).map(toAuditEventRecord);
  const earlyFromSeq = earlyEvents[0]?.seq ?? 0;

  // watch.chain_gap (SPEC §12 M4): only checkable once there is a previous
  // anchored run to be continuous with. See checks/watch.ts's header comment
  // for why this compares HASHES (events[0].prevHash vs. what git published
  // as prevRecord.audit.head), not seq numbers — a seq comparison anchored
  // at the same cursor used to run the query above would be tautological.
  if (storeKind === "postgres" && options.prevRecord !== null) {
    const expectedPrevHead = options.prevRecord.audit.head;
    const actualPrevHead = earlyEvents[0]?.prevHash ?? null;
    const chainGapBaseline: ChainGapBaseline = {
      expectedFromSeq: options.prevRecord.audit.toSeq + 1,
      actualFromSeq: earlyFromSeq === 0 ? options.prevRecord.audit.toSeq + 1 : earlyFromSeq,
      expectedPrevHead,
      actualPrevHead: earlyEvents.length === 0 ? expectedPrevHead : actualPrevHead,
    };
    const chainGapId = checkId("watch", "dogwatch", WATCH_CHAIN_GAP);
    const chainGapRequest = {
      method: "GET",
      url: "https://github.com/jamessuuu/dogwatch",
      headersSent: [],
      timeoutMs,
    };
    const ruleFn = RULES_BY_ID[WATCH_CHAIN_GAP];
    if (ruleFn === undefined) {
      throw new Error(`no rule function registered for ruleId ${WATCH_CHAIN_GAP}`);
    }
    const outcome = ruleFn(
      { redirects: [], headers: {}, json: { chainGap: chainGapBaseline } },
      { targetId: "dogwatch", checkId: chainGapId, request: { method: "GET", url: chainGapRequest.url }, observedAt }
    );
    allChecks.push({
      id: chainGapId,
      family: "watch",
      targetId: "dogwatch",
      ruleId: outcome.ruleId,
      title: outcome.title,
      request: chainGapRequest,
      observedAt,
      verdict: outcome.verdict,
      evidence: outcome.evidence,
      reproduce: reproduceCurl(chainGapRequest),
    });
  }

  // ── findings: only from finding-verdict checks, via hysteresis ──────────
  const previousFindings = options.prevRecord?.findings ?? [];
  const findings: Finding[] = [];
  for (const check of allChecks) {
    if (check.verdict !== "finding") continue;
    // The rule module is the only author of a statement (R13) — the builder
    // re-derives it here from the SAME evidence via the SAME rule function,
    // rather than trusting anything else, so there is only ever one path
    // that can produce finding text.
    const ruleFn = RULES_BY_ID[check.ruleId];
    if (ruleFn === undefined) {
      throw new Error(`no rule function registered for ruleId ${check.ruleId}`);
    }
    const outcome = ruleFn(check.evidence, {
      targetId: check.targetId,
      checkId: check.id,
      request: { method: check.request.method, url: check.request.url },
      observedAt: check.observedAt,
    });
    if (outcome.verdict !== "finding" || outcome.findingStatement === undefined || outcome.findingSeverity === undefined) {
      throw new Error(`rule ${check.ruleId} did not reproduce a finding for check ${check.id}`);
    }
    const fingerprint = findingFingerprint(check.id, check.ruleId);
    const hysteresis = resolveHysteresis({ fingerprint, severity: outcome.findingSeverity, runId }, previousFindings);
    findings.push({
      id: findingId(check.id, runId),
      checkId: check.id,
      ruleId: check.ruleId,
      severity: outcome.findingSeverity,
      status: hysteresis.status,
      statement: outcome.findingStatement,
      sources: [
        {
          url: check.request.url,
          method: check.request.method,
          status: check.evidence.status ?? 0,
          retrievedAt: check.observedAt,
          evidencePath: `checks[?(@.id=="${check.id}")].evidence`,
        },
      ],
      firstSeenRunId: hysteresis.firstSeenRunId,
      fingerprint,
    });
  }

  const absenceOfEvidence = buildAbsenceOfEvidence(allChecks);
  const endedAtMs = options.now();
  const endedAt = new Date(endedAtMs).toISOString();

  // ── advisory LLM / cost (SPEC §8, M3) — a quiet night (findings.length
  // === 0) never even constructs a budget store or client: llm:{calls:0,
  // reason:"no_findings"} and microUsd 0 stay exact, as SPEC requires.
  const advisory = await runAdvisoryPipeline({
    runId,
    findings,
    checks: allChecks,
    pricing: options.pricing,
    pricingManifestLabel: options.pricingManifest,
    now: options.now,
    llmClient: options.llmClient,
    budgetStore: options.budgetStore ?? new InMemoryBudgetStore(),
    budgetCaps: options.budgetCaps,
    model: options.llmModel,
    timeoutMs: options.llmTimeoutMs,
  });
  const findingsWithAdvisory = advisory.findings;
  const cost = advisory.cost;
  const llm = advisory.llm;

  // ── propose → open gates → notify (SPEC §5 steps 1-3, M5) ───────────────
  // Runs AFTER advisory (SPEC's own ordering) and BEFORE the final audit
  // block below, so any gate-open audit events land in THIS run's
  // audit.events like any other event this run produced.
  const proposed =
    options.proposeActions === undefined
      ? { actions: [], gates: [], refusals: [] }
      : await options.proposeActions({
          sluice,
          checks: allChecks,
          findings: findingsWithAdvisory,
          storeKind,
          runId,
          startedAt,
          now: options.now,
        });

  // ── audit: the FINAL, authoritative slice — re-queried now that propose
  // may have appended more events (gate opens) since the early peek above.
  const events = (await sluice.audit.since({ namespace, seq: startCursor }, 100_000)).map(toAuditEventRecord);
  const fromSeq = events[0]?.seq ?? 0;
  const toSeq = events.at(-1)?.seq ?? 0;
  const head = events.at(-1)?.hash ?? null;
  // sluice's own `audit.verify()` (M9 hash-chain, real cryptographic
  // verification of every event's prevHash/hash linkage across the STORE'S
  // ENTIRE namespace history, not just this run's slice) — not a
  // seq-contiguity approximation (SPEC §1 non-goal 4 / §7 tamper-evidence:
  // "sluice's primitive, not a copy of it").
  const verifyResult = await sluice.audit.verify(namespace);
  // Only meaningful once the trail is durably anchored (SPEC §3 Decision 1):
  // a fresh MemoryStore has no cross-run history to be continuous WITH.
  const prevHead: string | null = storeKind === "postgres" ? (options.prevRecord?.audit.head ?? null) : null;

  // SPEC §9: a configured-but-unreachable database is a real degradation,
  // published alongside whatever the LLM pipeline already degraded (the two
  // are independent dimensions — either, both, or neither can be true on a
  // given run).
  const degraded: DegradedEntry[] =
    options.storeDegradeReason === undefined
      ? advisory.degraded
      : [...advisory.degraded, { component: "store", reason: options.storeDegradeReason }];

  const prevRunId = options.prevRecord?.runId ?? null;
  const prevRecordHash = options.prevRecord === null ? null : computeRecordHash(options.prevRecord);

  const recordWithoutHash: RunRecord = {
    formatVersion: 1,
    runId,
    kind: options.kind,
    watchVersion: options.watchVersion,
    checkPackVersion: options.checkPackVersion,
    commit: options.commit,
    targetsHash: options.targetsHash,
    pricingManifest: options.pricingManifest,
    scheduledFor: options.scheduledFor,
    startedAt,
    endedAt,
    trigger: options.trigger,
    checks: allChecks,
    findings: findingsWithAdvisory,
    absenceOfEvidence,
    metrics: allMetrics,
    actions: proposed.actions,
    gates: proposed.gates,
    refusals: proposed.refusals,
    cost,
    llm,
    degraded,
    audit: {
      namespace,
      store: storeKind,
      fromSeq,
      toSeq,
      prevHead,
      head,
      // sluice's own `audit.verify()` (M9 hash-chain, real cryptographic
      // verification of every event's prevHash/hash linkage) — not a
      // seq-contiguity approximation.
      verified: verifyResult.ok,
      events,
    },
    chain: { prevRunId, prevRecordHash, recordHash: "", anchored: storeKind === "postgres" },
    amendments: [],
  };

  const recordHash = computeRecordHash(recordWithoutHash);
  return { ...recordWithoutHash, chain: { ...recordWithoutHash.chain, recordHash } };
}

export { checkId };
