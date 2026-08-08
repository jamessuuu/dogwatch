/**
 * Classify what a wrapped probe call threw into either a `skipped`
 * (breaker open — SPEC §9: "a host that is failing hard produces
 * skipped:circuit_open instead of ten timeouts") or an `error` outcome.
 */
import { SluiceError } from "@jamessuuu/sluice";
import { ProbeError } from "../probe/types.js";
import type { ErrorReasonCode, SkipReasonCode } from "./schema.js";

export type ProbeFailure =
  | { kind: "skipped"; skipReason: SkipReasonCode }
  | { kind: "error"; errorCode: ErrorReasonCode };

export function classifyProbeFailure(cause: unknown): ProbeFailure {
  if (cause instanceof SluiceError && cause.code === "E_CIRCUIT_OPEN") {
    return { kind: "skipped", skipReason: "circuit_open" };
  }
  if (cause instanceof ProbeError) {
    return { kind: "error", errorCode: cause.code };
  }
  return { kind: "error", errorCode: "network_error" };
}
