/**
 * The honesty rubric (SPEC §7): `dogwatch verify` runs on every committed
 * record on every push — cheap, deterministic, offline. Every function here
 * is pure and imports nothing from `node:*` (SPEC §4 isolation rule) — this
 * is what lets the M6 browser Verify button run the identical code a
 * visitor's browser executes with zero server.
 */
import { verifyEvents, type AuditEvent as SluiceAuditEvent } from "@jamessuuu/sluice";
import { RULES_BY_ID } from "../checks/index.js";
import { computeRecordHash } from "../record/hash.js";
import { ALLOWED_HEADER_NAMES } from "../record/headers.js";
import { TERMINAL_VERDICTS, type RunRecord } from "../record/schema.js";
import { violation, type Violation } from "./types.js";

export interface RubricOptions {
  /** R13's expensive half: re-run every rule over stored evidence and
   * compare. Off by default (CLI `--rerun-rules`). */
  rerunRules?: boolean;
  /** The immediately preceding published record, if available — enables
   * the cross-run half of R11/R12. `null`/absent degrades those checks to
   * their single-record half only (documented, not silently skipped). */
  prevRecord?: RunRecord | null;
}

// ── R1 ───────────────────────────────────────────────────────────────────

function checkR1(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  if (record.checks.length === 0) {
    out.push(violation("R1", "E_NO_CHECKS", "checks[] is empty"));
    return out;
  }
  for (const c of record.checks) {
    if (!(TERMINAL_VERDICTS as readonly string[]).includes(c.verdict)) {
      out.push(violation("R1", "E_CHECK_NONTERMINAL", `check ${c.id} has non-terminal verdict "${c.verdict}"`, c.id));
    }
  }
  return out;
}

// ── R2 / R3 ──────────────────────────────────────────────────────────────

function checkR2R3(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const checksById = new Map(record.checks.map((c) => [c.id, c]));
  const findingCheckIds = new Set(record.findings.map((f) => f.checkId));

  for (const f of record.findings) {
    const check = checksById.get(f.checkId);
    if (check?.verdict !== "finding") {
      out.push(violation("R2", "E_ORPHAN_FINDING", `finding ${f.id} references check ${f.checkId}, which is not a finding-verdict check`, f.id));
    }
  }
  for (const c of record.checks) {
    if (c.verdict === "finding" && !findingCheckIds.has(c.id)) {
      out.push(violation("R3", "E_UNREPORTED_CHECK", `check ${c.id} has verdict "finding" but no finding references it`, c.id));
    }
  }
  return out;
}

// ── R4 ───────────────────────────────────────────────────────────────────

function resolvesInRecord(evidencePath: string, record: RunRecord): boolean {
  const m = /checks\[\?\(@\.id=="([^"]+)"\)\]\.evidence/.exec(evidencePath);
  if (m === null) return false;
  const id = m[1];
  return id !== undefined && record.checks.some((c) => c.id === id);
}

function checkR4(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const startedAtMs = Date.parse(record.startedAt);
  const endedAtMs = Date.parse(record.endedAt);
  for (const f of record.findings) {
    if (f.sources.length === 0) {
      out.push(violation("R4", "E_UNSOURCED_FINDING", `finding ${f.id} has no sources`, f.id));
      continue;
    }
    for (const [i, source] of f.sources.entries()) {
      const problems: string[] = [];
      if (!source.url.startsWith("https://")) problems.push("source.url is not absolute https");
      const retrievedMs = Date.parse(source.retrievedAt);
      if (Number.isNaN(retrievedMs) || retrievedMs < startedAtMs || retrievedMs > endedAtMs) {
        problems.push("source.retrievedAt is outside [startedAt, endedAt]");
      }
      if (!resolvesInRecord(source.evidencePath, record)) {
        problems.push("source.evidencePath does not resolve inside this record");
      }
      if (problems.length > 0) {
        out.push(violation("R4", "E_UNSOURCED_FINDING", `finding ${f.id} source[${String(i)}]: ${problems.join("; ")}`, f.id));
      }
    }
  }
  return out;
}

// ── R5 ───────────────────────────────────────────────────────────────────

function checkR5(record: RunRecord): Violation[] {
  if (record.findings.length !== 0) return [];
  const actualClean = record.checks.filter((c) => c.verdict === "pass").length;
  if (record.absenceOfEvidence.checksClean !== actualClean) {
    return [
      violation(
        "R5",
        "E_NO_ABSENCE_SECTION",
        `absenceOfEvidence.checksClean (${String(record.absenceOfEvidence.checksClean)}) does not equal the actual pass count (${String(actualClean)})`
      ),
    ];
  }
  return [];
}

// ── R6 ───────────────────────────────────────────────────────────────────

function checkR6(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const notCheckedByCheckId = new Map(record.absenceOfEvidence.notChecked.map((n) => [n.checkId, n.reasonCode]));

  for (const c of record.checks) {
    if (c.verdict === "skipped") {
      if (c.skipReason === undefined) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} is skipped with no skipReason`, c.id));
        continue;
      }
      const listed = notCheckedByCheckId.get(c.id);
      if (listed === undefined) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} is skipped but absent from absenceOfEvidence.notChecked`, c.id));
      } else if (listed !== c.skipReason) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} notChecked reasonCode ("${listed}") does not match its skipReason ("${c.skipReason}")`, c.id));
      }
    }
    if (c.verdict === "error") {
      if (c.errorCode === undefined) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} is error with no errorCode`, c.id));
        continue;
      }
      const listed = notCheckedByCheckId.get(c.id);
      if (listed === undefined) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} errored but is absent from absenceOfEvidence.notChecked`, c.id));
      } else if (listed !== c.errorCode) {
        out.push(violation("R6", "E_SILENT_SKIP", `check ${c.id} notChecked reasonCode ("${listed}") does not match its errorCode ("${c.errorCode}")`, c.id));
      }
    }
  }

  const realNotCheckedIds = new Set(
    record.checks.filter((c) => c.verdict === "skipped" || c.verdict === "error").map((c) => c.id)
  );
  for (const entry of record.absenceOfEvidence.notChecked) {
    if (!realNotCheckedIds.has(entry.checkId)) {
      out.push(violation("R6", "E_SILENT_SKIP", `absenceOfEvidence.notChecked references ${entry.checkId}, which is not a skipped/error check`, entry.checkId));
    }
  }
  return out;
}

// ── shared: the amendment gate-overlay (M5) ────────────────────────────────

/**
 * A gate is opened once, in the run that proposed it, and published in that
 * run's TOP-LEVEL `gates[]` — Decision 2 forbids ever rewriting that entry.
 * Its decision/execution almost always happens later, in a different
 * process (`dogwatch resume`), and lands in an AMENDMENT's `gates[]`
 * instead (schema.ts's `AmendmentSchema` comment). The overlay below maps
 * each gate id to the LATEST amendment's version of it, if any — that is
 * the gate's current, effective state; R7/R8 both need it to avoid treating
 * every gate that has since been decided as permanently "unbacked".
 */
function effectiveGatesById(record: RunRecord): Map<string, RunRecord["gates"][number]> {
  const byId = new Map(record.gates.map((g) => [g.id, g]));
  for (const amendment of record.amendments) {
    for (const g of amendment.gates) byId.set(g.id, g);
  }
  return byId;
}

// ── R7 ───────────────────────────────────────────────────────────────────

function checkR7(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const gatesById = effectiveGatesById(record);
  // Executed/refused actions almost always arrive via an amendment (the
  // decision + execution happen in a later `dogwatch resume` process, not
  // inside the run that only ever got as far as `gated_pending`) — R7 must
  // see both the base record's actions and every amendment's.
  const allActions = [...record.actions, ...record.amendments.flatMap((a) => a.actions)];
  for (const a of allActions) {
    if (a.status === "executed") {
      if (a.gateId === undefined || a.effectKey === undefined || a.effectOutcome === undefined) {
        out.push(violation("R7", "E_ACTION_UNBACKED", `action ${a.id} is executed but missing gateId/effectKey/effectOutcome`, a.id));
      } else {
        const gate = gatesById.get(a.gateId);
        if (gate?.status !== "approved") {
          out.push(violation("R7", "E_ACTION_UNBACKED", `action ${a.id} is executed but gate ${a.gateId} is not approved`, a.id));
        }
      }
    }
    if (a.status === "refused" && a.reasonCode === undefined) {
      out.push(violation("R7", "E_ACTION_UNBACKED", `action ${a.id} is refused with no reasonCode`, a.id));
    }
  }
  return out;
}

// ── R8 ───────────────────────────────────────────────────────────────────

const GATE_TERMINAL_EVENT_TYPES = new Set(["gate.decided", "gate.timed_out"]);

function checkR8(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const endedAtMs = Date.parse(record.endedAt);
  const effectiveById = effectiveGatesById(record);
  // gate.opened always lands in THIS run's own audit trail (opening happens
  // synchronously during propose, inside the same sluice session that
  // produced record.audit.events); the terminal event almost always lands
  // in whichever amendment recorded the eventual decision — so the terminal
  // search spans every amendment's events too.
  const allEvents = [...record.audit.events, ...record.amendments.flatMap((a) => a.events)];
  for (const g of record.gates) {
    const effective = effectiveById.get(g.id) ?? g;
    const events = allEvents.filter((e) => e.subjectType === "gate" && e.subjectKey === g.key);
    const opened = events.some((e) => e.type === "gate.opened");
    const terminal = events.some((e) => GATE_TERMINAL_EVENT_TYPES.has(e.type));
    if (effective.status === "pending") {
      const expiresMs = Date.parse(effective.expiresAt);
      if (!opened || Number.isNaN(expiresMs) || expiresMs <= endedAtMs) {
        out.push(violation("R8", "E_GATE_UNBACKED", `gate ${g.id} is pending but not backed by an open audit event with a future expiresAt`, g.id));
      }
      continue;
    }
    if (!opened || !terminal) {
      out.push(violation("R8", "E_GATE_UNBACKED", `gate ${g.id} (status ${effective.status}) is missing a gate.opened + terminal audit event pair`, g.id));
    }
  }
  return out;
}

// ── R9 ───────────────────────────────────────────────────────────────────

function checkR9(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const sum = Object.values(record.cost.breakdown).reduce((a, b) => a + b, 0);
  if (Math.round(sum) !== record.cost.microUsd) {
    out.push(violation("R9", "E_COST_UNBACKED", `cost.microUsd (${String(record.cost.microUsd)}) does not equal the sum of breakdown (${String(sum)})`));
  }
  if (record.llm.calls > 0) {
    const usageMissing = record.llm.inputTokens === 0 || record.llm.outputTokens === 0;
    if (usageMissing && record.cost.certainty !== "unknown") {
      out.push(violation("R9", "E_COST_UNBACKED", 'llm.calls > 0 with missing usage tokens must publish cost.certainty:"unknown"'));
    }
  }
  return out;
}

// ── R10 ──────────────────────────────────────────────────────────────────

const FINDING_ID_RE = /F-[a-f0-9]+/g;
const URL_RE = /https?:\/\/[^\s")]+/g;

function checkR10(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const findingIds = new Set(record.findings.map((f) => f.id));
  const evidenceUrls = new Set(record.findings.flatMap((f) => f.sources.map((s) => s.url)));

  for (const f of record.findings) {
    if (f.advisory === undefined) continue;
    if (record.llm.calls === 0) {
      out.push(violation("R10", "E_ADVISORY_UNGROUNDED", `finding ${f.id} carries an advisory but llm.calls is 0`, f.id));
      continue;
    }
    const mentionedIds = f.advisory.note.match(FINDING_ID_RE) ?? [];
    for (const id of mentionedIds) {
      if (!findingIds.has(id)) {
        out.push(violation("R10", "E_ADVISORY_UNGROUNDED", `finding ${f.id} advisory references unknown finding id ${id}`, f.id));
      }
    }
    const mentionedUrls = f.advisory.note.match(URL_RE) ?? [];
    for (const url of mentionedUrls) {
      if (!evidenceUrls.has(url)) {
        out.push(violation("R10", "E_ADVISORY_UNGROUNDED", `finding ${f.id} advisory references a URL outside the record's evidence set: ${url}`, f.id));
      }
    }
  }
  return out;
}

// ── R11 ──────────────────────────────────────────────────────────────────

function checkR11(record: RunRecord, prevRecord: RunRecord | null | undefined): Violation[] {
  const out: Violation[] = [];
  const probedSomething = record.checks.some((c) => c.verdict !== "skipped");
  if (probedSomething && record.audit.events.length === 0) {
    out.push(violation("R11", "E_CHAIN_BROKEN", "audit.events is empty despite at least one non-skipped check"));
    return out;
  }
  let expected = record.audit.fromSeq;
  for (const e of record.audit.events) {
    if (e.seq !== expected) {
      out.push(violation("R11", "E_CHAIN_BROKEN", `audit event seq ${String(e.seq)} is not contiguous (expected ${String(expected)})`));
      break;
    }
    expected += 1;
  }
  // Real cryptographic verification — sluice's own `verifyEvents` (M9 hash
  // chain), not a re-derived copy of it (SPEC §1 non-goal 4). This is what
  // makes `audit.verified` a checkable claim rather than an assertion: a
  // record that says `verified: true` but whose exported events do not
  // actually re-verify is exactly what this half of R11 catches. Isomorphic
  // and store-free (SPEC §14 Q1's resolution) — safe to call from this
  // node-free module and from the M6 browser Verify button alike.
  if (record.audit.events.length > 0) {
    const recomputed = verifyEvents(record.audit.events as unknown as SluiceAuditEvent[], record.audit.prevHead);
    if (recomputed.ok !== record.audit.verified) {
      out.push(
        violation(
          "R11",
          "E_CHAIN_BROKEN",
          `audit.verified (${String(record.audit.verified)}) does not match the recomputed hash-chain result (${String(recomputed.ok)})`
        )
      );
    } else if (!recomputed.ok) {
      out.push(violation("R11", "E_CHAIN_BROKEN", `audit event hash chain is broken at index ${String(recomputed.brokenAt ?? -1)}`));
    }
  }
  if (record.audit.store === "postgres" && prevRecord !== null && prevRecord !== undefined) {
    const hasGapFinding = record.findings.some((f) => f.ruleId === "watch.chain_gap");
    if (record.audit.fromSeq !== prevRecord.audit.toSeq + 1 && !hasGapFinding) {
      out.push(
        violation(
          "R11",
          "E_CHAIN_BROKEN",
          `audit.fromSeq (${String(record.audit.fromSeq)}) does not follow the previous run's toSeq (${String(prevRecord.audit.toSeq)}) and no watch.chain_gap finding is present`
        )
      );
    }
  }
  return out;
}

// ── R12 ──────────────────────────────────────────────────────────────────

function checkR12(record: RunRecord, prevRecord: RunRecord | null | undefined): Violation[] {
  const out: Violation[] = [];
  const recomputed = computeRecordHash(record);
  if (recomputed !== record.chain.recordHash) {
    out.push(violation("R12", "E_RECORD_TAMPERED", `chain.recordHash (${record.chain.recordHash}) does not match the recomputed hash (${recomputed})`));
  }
  if (prevRecord !== null && prevRecord !== undefined) {
    const prevHash = computeRecordHash(prevRecord);
    if (record.chain.prevRecordHash !== prevHash) {
      out.push(violation("R12", "E_RECORD_TAMPERED", `chain.prevRecordHash (${String(record.chain.prevRecordHash)}) does not match the previous record's recomputed hash (${prevHash})`));
    }
  }
  return out;
}

// ── R13 ──────────────────────────────────────────────────────────────────

/**
 * Skip reasons decided BEFORE any rule function ever runs (SPEC §9: a site
 * that is not deployed, or a tripped circuit breaker, is a pipeline-level
 * refusal to probe at all — never a judgment made from recorded evidence).
 * A check carrying one of these has empty/placeholder evidence by
 * construction (`build-site.ts`'s `skippedCheck`/`errorCheck` helpers never
 * call into `src/checks`), so there is nothing for R13 to re-derive: the
 * rule function was never the source of that verdict in the first place.
 * Contrast `not_applicable`/`no_baseline`, which a rule function (e.g.
 * `evaluateHeaderDrift`) DOES produce from real evidence — those stay in
 * R13's rerun. Every `error`-verdict check is the same story: a probe
 * failure (`classifyProbeFailure`) is caught upstream of any rule call.
 */
const NEVER_RULE_EVALUATED_SKIP_REASONS = new Set(["not_published", "circuit_open", "rate_limited"]);

function checkR13(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const findingByCheckId = new Map(record.findings.map((f) => [f.checkId, f]));
  for (const c of record.checks) {
    if (c.verdict === "error") continue;
    if (c.verdict === "skipped" && c.skipReason !== undefined && NEVER_RULE_EVALUATED_SKIP_REASONS.has(c.skipReason)) {
      continue;
    }
    const ruleFn = RULES_BY_ID[c.ruleId];
    if (ruleFn === undefined) continue; // rule outside the pure-rerun registry (e.g. a stub family) — not R13's concern
    const rederived = ruleFn(c.evidence, {
      targetId: c.targetId,
      checkId: c.id,
      request: { method: c.request.method, url: c.request.url },
      observedAt: c.observedAt,
    });
    if (rederived.verdict !== c.verdict) {
      out.push(
        violation("R13", "E_MANUFACTURED_FINDING", `check ${c.id}: stored verdict "${c.verdict}" does not match re-derived verdict "${rederived.verdict}"`, c.id)
      );
      continue;
    }
    if (c.verdict === "finding") {
      const stored = findingByCheckId.get(c.id);
      if (stored === undefined) continue; // R2/R3 already cover the orphan/unreported cases
      if (rederived.findingStatement !== stored.statement) {
        out.push(violation("R13", "E_MANUFACTURED_FINDING", `finding ${stored.id} statement does not byte-match template(ruleId, evidence)`, stored.id));
      }
    }
  }
  return out;
}

// ── R14 ──────────────────────────────────────────────────────────────────

function checkR14(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  const checkIds = new Set(record.checks.map((c) => c.id));
  for (const m of record.metrics) {
    if ("severity" in m) {
      out.push(violation("R14", "E_METRIC_AS_FINDING", `metric ${m.id} carries a severity field`, m.id));
    }
    if (checkIds.has(m.id)) {
      out.push(violation("R14", "E_METRIC_AS_FINDING", `metric ${m.id} shares an id with a check — metrics must not double as findings`, m.id));
    }
  }
  for (const f of record.findings) {
    if (record.metrics.some((m) => m.id === f.checkId)) {
      out.push(violation("R14", "E_METRIC_AS_FINDING", `finding ${f.id} references a metric id as its checkId`, f.id));
    }
  }
  return out;
}

// ── R15 ──────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "github-token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "anthropic-key", re: /sk-ant-[A-Za-z0-9-_]{20,}/ },
  { name: "generic-api-key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "jwt", re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: "pem-private-key", re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
];

function walkStrings(value: unknown, path: string, onString: (s: string, path: string) => void): void {
  if (typeof value === "string") {
    onString(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      walkStrings(v, `${path}[${String(i)}]`, onString);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      walkStrings(v, `${path}.${k}`, onString);
    }
  }
}

function checkR15(record: RunRecord): Violation[] {
  const out: Violation[] = [];
  walkStrings(record, "$", (s, path) => {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.re.test(s)) {
        out.push(violation("R15", "E_SECRET_LEAK", `value at ${path} matches the ${pattern.name} secret shape`, path));
      }
    }
  });
  for (const c of record.checks) {
    for (const headerName of Object.keys(c.evidence.headers)) {
      if (!ALLOWED_HEADER_NAMES.has(headerName)) {
        out.push(violation("R15", "E_SECRET_LEAK", `check ${c.id} evidence.headers carries non-allowlisted header "${headerName}"`, c.id));
      }
    }
  }
  return out;
}

// ── aggregate ────────────────────────────────────────────────────────────

export function verifyRecord(record: RunRecord, options?: RubricOptions): Violation[] {
  const prevRecord = options?.prevRecord;
  const violations: Violation[] = [
    ...checkR1(record),
    ...checkR2R3(record),
    ...checkR4(record),
    ...checkR5(record),
    ...checkR6(record),
    ...checkR7(record),
    ...checkR8(record),
    ...checkR9(record),
    ...checkR10(record),
    ...checkR11(record, prevRecord),
    ...checkR12(record, prevRecord),
    ...checkR14(record),
    ...checkR15(record),
  ];
  if (options?.rerunRules === true) {
    violations.push(...checkR13(record));
  }
  return violations;
}
