/**
 * The run-record Zod source of truth (SPEC §3). `schemas/run-record.v1.json`
 * is generated from this file (`pnpm schema:gen`) — CI drift-checks that the
 * committed JSON Schema still matches (`pnpm schema:check`).
 *
 * This module imports nothing from `node:*` and nothing from `src/probe` —
 * it is pure data shape, safe to import from `src/checks`, `src/verify`, and
 * (M6) the browser Verify button.
 */
import { z } from "zod";

// ── shared enums ────────────────────────────────────────────────────────────

/** The nine check families declared in `targets.json` (SPEC §2). */
export const FamilySchema = z.enum([
  "reach",
  "header",
  "brand",
  "link",
  "weight",
  "artifact",
  "repo",
  "pkg",
  "watch",
]);
export type Family = z.infer<typeof FamilySchema>;

/** `pending` is never assigned by the runner — a check is only ever
 * appended to a record once it has reached a terminal state. It exists in
 * the type so R1 (`E_CHECK_NONTERMINAL`) has something to reject: a
 * published check stuck at `pending` would mean the run was interrupted
 * mid-check and the record should never have been written at all. */
export const VerdictSchema = z.enum(["pass", "finding", "error", "skipped", "pending"]);
export type Verdict = z.infer<typeof VerdictSchema>;
export const TERMINAL_VERDICTS = ["pass", "finding", "error", "skipped"] as const;

/** R6: every `skipped` check carries one of these, never a free-text reason. */
export const SkipReasonCodeSchema = z.enum([
  "not_published",
  "not_applicable",
  "no_baseline",
  "circuit_open",
  "rate_limited",
]);
export type SkipReasonCode = z.infer<typeof SkipReasonCodeSchema>;

/** R6: every `error` check carries one of these, never a free-text reason. */
export const ErrorReasonCodeSchema = z.enum([
  "timeout",
  "network_error",
  "http_error",
  "parse_error",
  "forbidden",
  "unreachable",
]);
export type ErrorReasonCode = z.infer<typeof ErrorReasonCodeSchema>;

export const SeveritySchema = z.enum(["low", "medium", "high"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const FindingStatusSchema = z.enum(["unconfirmed", "confirmed"]);
export type FindingStatus = z.infer<typeof FindingStatusSchema>;

export const ActionKindSchema = z.enum(["issue.open", "issue.comment"]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

export const ActionStatusSchema = z.enum([
  "proposed",
  "gated_pending",
  "executed",
  "refused",
]);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const GateStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "timed_out",
  "cancelled",
]);
export type GateStatus = z.infer<typeof GateStatusSchema>;

/** SPEC §9's failure-contract table, closed into an enum for R7. */
export const RefusalReasonCodeSchema = z.enum([
  "store_unavailable",
  "duplicate_suppressed",
  "gate_timed_out",
  "circuit_open",
  "not_confirmed",
]);
export type RefusalReasonCode = z.infer<typeof RefusalReasonCodeSchema>;

export const DegradedComponentSchema = z.enum(["llm", "store", "probe"]);
export type DegradedComponent = z.infer<typeof DegradedComponentSchema>;

export const DegradedReasonSchema = z.enum([
  "daily_cap",
  "api_error",
  "schema_reject",
  "indeterminate",
  "store_unavailable",
]);
export type DegradedReason = z.infer<typeof DegradedReasonSchema>;

export const RunKindSchema = z.enum(["scheduled", "manual", "gap"]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const AuditStoreSchema = z.enum(["postgres", "memory"]);
export type AuditStoreKind = z.infer<typeof AuditStoreSchema>;

export const LlmDegradeReasonSchema = z.enum([
  "no_findings",
  // M0-M2: no LLM feature exists yet at all (SPEC M3 lands the advisory
  // model) — used when calls:0 but findings.length > 0, so the record never
  // has to pretend the quiet-night reason applied when it did not.
  "not_implemented",
  "daily_cap",
  "api_error",
  "schema_reject",
  "indeterminate",
]);

// ── checks ──────────────────────────────────────────────────────────────────

export const RedirectHopSchema = z.strictObject({
  status: z.number().int(),
  url: z.string(),
});

export const CheckRequestSchema = z.strictObject({
  method: z.string(),
  url: z.string(),
  headersSent: z.array(z.string()),
  timeoutMs: z.number().int().positive(),
});
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

export const CheckEvidenceSchema = z.strictObject({
  status: z.number().int().optional(),
  finalUrl: z.string().optional(),
  redirects: z.array(RedirectHopSchema),
  headers: z.record(z.string(), z.string()),
  bodySha256: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  ms: z.number().nonnegative().optional(),
  tlsNotAfter: z.string().optional(),
  json: z.unknown().optional(),
  truncated: z.boolean().optional(),
});
export type CheckEvidence = z.infer<typeof CheckEvidenceSchema>;

// Cross-field invariants (skipped ⇒ skipReason, error ⇒ errorCode — R6) are
// deliberately NOT enforced here as a Zod `.check()`. `dogwatch verify`
// (src/verify/rubric.ts) is the single place every R1-R15 business rule
// lives, so a planted violation fixture (SPEC §11.2) that is otherwise
// well-typed JSON reaches the rubric and fails with its exact code, instead
// of being rejected one layer earlier by a generic Zod schema error.
export const CheckSchema = z.strictObject({
  id: z.string().min(1),
  family: FamilySchema,
  targetId: z.string().min(1),
  ruleId: z.string().min(1),
  title: z.string().min(1),
  request: CheckRequestSchema,
  observedAt: z.iso.datetime(),
  verdict: VerdictSchema,
  skipReason: SkipReasonCodeSchema.optional(),
  errorCode: ErrorReasonCodeSchema.optional(),
  evidence: CheckEvidenceSchema,
  reproduce: z.string().min(1),
});
export type Check = z.infer<typeof CheckSchema>;

// ── findings ────────────────────────────────────────────────────────────────

export const FindingSourceSchema = z.strictObject({
  url: z.url(),
  method: z.string(),
  status: z.number().int(),
  retrievedAt: z.iso.datetime(),
  evidencePath: z.string().min(1),
});

export const AdvisorySchema = z.strictObject({
  severity: SeveritySchema,
  note: z.string().max(600),
  model: z.string(),
  agreesWithRule: z.boolean(),
});

export const FindingSchema = z.strictObject({
  id: z.string().regex(/^F-/),
  checkId: z.string().min(1),
  ruleId: z.string().min(1),
  severity: SeveritySchema,
  status: FindingStatusSchema,
  statement: z.string().min(1),
  sources: z.array(FindingSourceSchema).min(1),
  firstSeenRunId: z.string().min(1),
  fingerprint: z.string().min(1),
  advisory: AdvisorySchema.optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

// ── absence of evidence ────────────────────────────────────────────────────

export const NotCheckedEntrySchema = z.strictObject({
  checkId: z.string().min(1),
  reasonCode: z.union([SkipReasonCodeSchema, ErrorReasonCodeSchema]),
});

export const AbsenceOfEvidenceSchema = z.strictObject({
  statement: z.string().min(1),
  checksClean: z.number().int().nonnegative(),
  byFamily: z.record(z.string(), z.number().int().nonnegative()),
  notChecked: z.array(NotCheckedEntrySchema),
});
export type AbsenceOfEvidence = z.infer<typeof AbsenceOfEvidenceSchema>;

// ── metrics ─────────────────────────────────────────────────────────────────

// R14 (`E_METRIC_AS_FINDING`: "no metric carries a severity") needs a metric
// object that CAN structurally carry a stray `severity` key for a planted
// violation fixture to construct — `looseObject` (unknown keys preserved,
// not stripped or rejected) instead of `strictObject`, so the rubric layer
// (not the parser) is what catches it.
export const MetricSchema = z.looseObject({
  id: z.string().min(1),
  targetId: z.string().min(1),
  name: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  delta: z.number().optional(),
  note: z.literal("recorded, not judged"),
});
export type Metric = z.infer<typeof MetricSchema>;

// ── actions / gates / refusals ─────────────────────────────────────────────

export const ActionDraftSchema = z.strictObject({
  title: z.string().min(1),
  body: z.string().min(1),
  author: z.literal("claude-haiku-4-5"),
  approvedBy: z.string().optional(),
  approvedAt: z.iso.datetime().optional(),
});

// R7's cross-field invariant (executed ⇒ gateId+effectKey+effectOutcome,
// refused ⇒ reasonCode) lives in src/verify/rubric.ts — see the CheckSchema
// comment above for why.
export const ActionSchema = z.strictObject({
  id: z.string().min(1),
  kind: ActionKindSchema,
  target: z.string().min(1),
  status: ActionStatusSchema,
  gateId: z.string().optional(),
  effectKey: z.string().optional(),
  effectOutcome: z.string().optional(),
  artifactUrl: z.url().optional(),
  draft: ActionDraftSchema.optional(),
  reasonCode: RefusalReasonCodeSchema.optional(),
});
export type Action = z.infer<typeof ActionSchema>;

export const GateEntrySchema = z.strictObject({
  id: z.string().min(1),
  key: z.string().min(1),
  status: GateStatusSchema,
  openedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().optional(),
  decidedBy: z.string().optional(),
  decisionChannel: z.string().optional(),
  reason: z.string().optional(),
});
export type GateEntry = z.infer<typeof GateEntrySchema>;

export const RefusalSchema = z.strictObject({
  subject: z.string().min(1),
  reasonCode: RefusalReasonCodeSchema,
  detail: z.string().min(1),
});
export type Refusal = z.infer<typeof RefusalSchema>;

// ── cost / llm / degraded ───────────────────────────────────────────────────

// R9's cross-field invariant (microUsd === sum(breakdown), usage tokens
// required when calls > 0) lives in src/verify/rubric.ts.
export const CostSchema = z.strictObject({
  currency: z.literal("USD"),
  microUsd: z.number().int().nonnegative(),
  certainty: z.enum(["reported", "unknown"]),
  breakdown: z.record(z.string(), z.number()),
  method: z.string().min(1),
});
export type Cost = z.infer<typeof CostSchema>;

export const LlmSchema = z.strictObject({
  calls: z.number().int().nonnegative(),
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  microUsd: z.number().int().nonnegative(),
  rejected: z.array(z.string()).optional(),
  reason: LlmDegradeReasonSchema.optional(),
});
export type Llm = z.infer<typeof LlmSchema>;

export const DegradedEntrySchema = z.strictObject({
  component: DegradedComponentSchema,
  reason: DegradedReasonSchema,
});
export type DegradedEntry = z.infer<typeof DegradedEntrySchema>;

// ── audit (events re-exported from sluice, kept structurally loose) ───────

export const AuditEventSchema = z.strictObject({
  id: z.string(),
  namespace: z.string(),
  seq: z.number().int(),
  ts: z.number().int(),
  subjectType: z.enum(["effect", "gate", "circuit", "custom"]),
  subjectKey: z.string(),
  type: z.string(),
  attempt: z.number().int().nullable(),
  actor: z.string(),
  data: z.record(z.string(), z.unknown()),
  prevHash: z.string().nullable(),
  hash: z.string().nullable(),
});
export type AuditEventRecord = z.infer<typeof AuditEventSchema>;

export const AuditBlockSchema = z.strictObject({
  namespace: z.string().min(1),
  store: AuditStoreSchema,
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
  prevHead: z.string().nullable(),
  head: z.string().nullable(),
  verified: z.boolean(),
  events: z.array(AuditEventSchema),
});
export type AuditBlock = z.infer<typeof AuditBlockSchema>;

// ── chain / amendments ──────────────────────────────────────────────────────

export const ChainSchema = z.strictObject({
  prevRunId: z.string().nullable(),
  prevRecordHash: z.string().nullable(),
  recordHash: z.string().min(1),
});
export type Chain = z.infer<typeof ChainSchema>;

export const AmendmentSchema = z.strictObject({
  at: z.iso.datetime(),
  by: z.string().min(1),
  kind: z.string().min(1),
  events: z.array(AuditEventSchema),
  actions: z.array(ActionSchema),
  refusals: z.array(RefusalSchema),
  amendmentHash: z.string().min(1),
});
export type Amendment = z.infer<typeof AmendmentSchema>;

// ── trigger ─────────────────────────────────────────────────────────────────

export const TriggerSchema = z.strictObject({
  workflow: z.string().nullable(),
  runUrl: z.string().nullable(),
  actor: z.string(),
});
export type Trigger = z.infer<typeof TriggerSchema>;

// ── the full run record ────────────────────────────────────────────────────

export const RunRecordSchema = z.strictObject({
  formatVersion: z.literal(1),
  runId: z.string().min(1),
  kind: RunKindSchema,
  watchVersion: z.string().min(1),
  checkPackVersion: z.string().min(1),
  commit: z.string().min(1),
  targetsHash: z.string().min(1),
  pricingManifest: z.string().min(1),
  scheduledFor: z.iso.datetime().nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  trigger: TriggerSchema,
  checks: z.array(CheckSchema),
  findings: z.array(FindingSchema),
  absenceOfEvidence: AbsenceOfEvidenceSchema,
  metrics: z.array(MetricSchema),
  actions: z.array(ActionSchema),
  gates: z.array(GateEntrySchema),
  refusals: z.array(RefusalSchema),
  cost: CostSchema,
  llm: LlmSchema,
  degraded: z.array(DegradedEntrySchema),
  audit: AuditBlockSchema,
  chain: ChainSchema,
  amendments: z.array(AmendmentSchema),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

/** The base record hashed for Decision 2 — everything except `amendments`. */
export const BaseRecordForHashSchema = RunRecordSchema.omit({ amendments: true });
export type BaseRecordForHash = z.infer<typeof BaseRecordForHashSchema>;
