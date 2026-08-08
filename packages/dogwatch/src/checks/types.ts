/**
 * The pure-rule contract (SPEC §4): `rule(evidence) → finding|pass`. Every
 * function in src/checks is a pure, zero-I/O function of its evidence
 * argument — no clock, no fetch, no fs. The record builder (src/record)
 * supplies evidence (from src/probe) and a baseline (read from the previous
 * committed record); src/verify's `--rerun-rules` calls the SAME functions
 * over stored evidence to re-derive findings byte-for-byte (R13). This dual
 * use is exactly what makes a manufactured finding impossible: there is no
 * other path in the type system that produces a `Finding`.
 */
import type {
  CheckEvidence,
  ErrorReasonCode,
  Severity,
  SkipReasonCode,
} from "../record/schema.js";

export interface RuleOutcome {
  ruleId: string;
  title: string;
  verdict: "pass" | "finding" | "error" | "skipped";
  evidence: CheckEvidence;
  skipReason?: SkipReasonCode;
  errorCode?: ErrorReasonCode;
  /** Present iff verdict === "finding". Always the return value of this
   * same rule's `template()` export — never authored anywhere else. */
  findingStatement?: string;
  findingSeverity?: Severity;
}

/** Every rule module's `template` has this shape — pure `evidence -> string`,
 * re-callable offline by src/verify (R13) without re-running the rule. */
export type FindingTemplate<E> = (evidence: E) => string;
