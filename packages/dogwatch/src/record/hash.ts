/**
 * Decision 2 (SPEC §3): `chain.recordHash = sha256(canonicalJson(record
 * minus amendments))`. Reuses sluice's own `canonicalJson` + `sha256Hex`
 * (compact, sorted-key JCS-equivalent form) rather than re-implementing
 * canonicalization or crypto (SPEC §1 non-goal 4: no sluice reimplementation).
 *
 * Pure, zero I/O — importable from src/verify (R12 re-derives this hash
 * offline / in the browser) without pulling in node builtins.
 */
import { canonicalJson, sha256Hex, type Json } from "@jamessuuu/sluice";
import type { BaseRecordForHash, RunRecord } from "./schema.js";

export function baseRecordOf(record: RunRecord): BaseRecordForHash {
  const { amendments: _amendments, ...base } = record;
  return base;
}

/**
 * The hash is necessarily computed with `chain.recordHash` itself blanked
 * (a hash cannot include its own output) — both the builder and
 * `dogwatch verify` (R12) do this exact same blank-then-hash step, so the
 * comparison is well-defined. `prevRunId`/`prevRecordHash` ARE included:
 * they are known before this run's hash is computed.
 */
export function computeRecordHash(record: RunRecord): string {
  const base = baseRecordOf(record);
  const blanked: BaseRecordForHash = { ...base, chain: { ...base.chain, recordHash: "" } };
  return sha256Hex(canonicalJson(blanked as unknown as Json));
}
