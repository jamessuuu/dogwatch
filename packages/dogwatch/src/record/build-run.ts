/**
 * Top-level run-record builder (SPEC §3/§4). Owns runId/clock/sluice setup,
 * fans out to `buildSiteChecks` per target, turns `finding`-verdict checks
 * into `Finding` rows with hysteresis applied, and assembles the audit /
 * cost / llm / chain blocks. `dogwatch watch` and the replay-golden harness
 * both call this same function — a live probe or a replay probe is the only
 * difference (SPEC §11).
 */
import { createSluice, MemoryStore, systemClock, type AuditEvent, type Clock } from "@jamessuuu/sluice";
import { RULES_BY_ID } from "../checks/index.js";
import { InMemoryBudgetStore, runAdvisoryPipeline, type BudgetCaps, type BudgetStore, type LlmClient } from "../llm/index.js";
import { buildAbsenceOfEvidence } from "./absence.js";
import { buildSiteChecks } from "./build-site.js";
import { computeRecordHash } from "./hash.js";
import { checkId, findingFingerprint, findingId, newRunId } from "./ids.js";
import { resolveHysteresis } from "./hysteresis.js";
import type { PricingManifest } from "./pricing-schema.js";
import { wrapProbeWithSluice } from "./sluice-probe.js";
import type {
  AuditEventRecord,
  Check,
  Finding,
  Metric,
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
}

function toAuditEventRecord(e: AuditEvent): AuditEventRecord {
  return {
    id: e.id,
    namespace: e.namespace,
    seq: e.seq,
    ts: e.ts,
    subjectType: e.subjectType,
    subjectKey: e.subjectKey,
    type: e.type,
    attempt: e.attempt,
    actor: e.actor,
    data: e.data,
    prevHash: e.prevHash,
    hash: e.hash,
  };
}

export async function buildRun(options: BuildRunOptions): Promise<RunRecord> {
  const namespace = options.namespace ?? "dogwatch";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const store = new MemoryStore();
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

  // ── audit: export everything this run's ephemeral MemoryStore recorded ──
  // `sluice.audit.verify()` is sluice's OWN hash-chain verifier (M9,
  // `verifyEvents` under the hood) — called here directly rather than
  // re-deriving seq/hash contiguity by hand (SPEC §1 non-goal 4 / §7
  // tamper-evidence: "sluice's primitive, not a copy of it").
  const rawEvents = await sluice.audit.since({ namespace, seq: 0 }, 100_000);
  const events = rawEvents.map(toAuditEventRecord);
  const fromSeq = events[0]?.seq ?? 0;
  const toSeq = events.at(-1)?.seq ?? 0;
  const head = events.at(-1)?.hash ?? null;
  const verifyResult = await sluice.audit.verify(namespace);

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
  const degraded = advisory.degraded;

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
    actions: [],
    gates: [],
    refusals: [],
    cost,
    llm,
    degraded,
    audit: {
      namespace,
      store: "memory",
      fromSeq,
      toSeq,
      // A fresh MemoryStore is created per run (M0-M2, per the sequencing
      // note — Postgres anchors the cross-run chain at M4), so this run's
      // chain genuinely starts at genesis: prevHead is null, not "unknown".
      prevHead: null,
      head,
      // sluice's own `audit.verify()` (M9 hash-chain, real cryptographic
      // verification of every event's prevHash/hash linkage) — not a
      // seq-contiguity approximation.
      verified: verifyResult.ok,
      events,
    },
    chain: { prevRunId, prevRecordHash, recordHash: "" },
    amendments: [],
  };

  const recordHash = computeRecordHash(recordWithoutHash);
  return { ...recordWithoutHash, chain: { ...recordWithoutHash.chain, recordHash } };
}

export { checkId };
