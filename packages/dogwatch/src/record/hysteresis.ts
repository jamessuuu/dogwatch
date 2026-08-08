/**
 * Hysteresis (SPEC §2): a `medium`/`low` finding needs 2 consecutive runs
 * before it is `confirmed`; `high` confirms on first sight. Night one
 * publishes `status:"unconfirmed"`. Pure — the previous run's findings are
 * handed in.
 */
import type { Severity } from "./schema.js";

export interface HysteresisInput {
  fingerprint: string;
  severity: Severity;
  runId: string;
}

export interface HysteresisResult {
  status: "unconfirmed" | "confirmed";
  firstSeenRunId: string;
}

export function resolveHysteresis(
  input: HysteresisInput,
  previousFindings: readonly { fingerprint: string; firstSeenRunId: string }[]
): HysteresisResult {
  const prior = previousFindings.find((f) => f.fingerprint === input.fingerprint);
  if (input.severity === "high") {
    return { status: "confirmed", firstSeenRunId: prior?.firstSeenRunId ?? input.runId };
  }
  if (prior !== undefined) {
    return { status: "confirmed", firstSeenRunId: prior.firstSeenRunId };
  }
  return { status: "unconfirmed", firstSeenRunId: input.runId };
}
