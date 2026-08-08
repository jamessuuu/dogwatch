/**
 * Amendments (SPEC §3 Decision 2, M5): post-publication facts (a gate
 * decided hours later) land here, hash-linked to the previous amendment —
 * "nothing published is ever rewritten." The base record's fields
 * (including `chain.recordHash`, computed over everything MINUS
 * `amendments`) are never touched by appending one; that is the whole
 * point of keeping amendments a separate array instead of patching the
 * base record in place.
 *
 * Pure, zero I/O — `src/effects/resume.ts` is what reads/writes the file;
 * this module only knows how to compute the next amendment's hash and
 * return a new record value with it appended.
 */
import { canonicalJson, sha256Hex, type Json } from "@jamessuuu/sluice";
import type { Amendment, RunRecord } from "./schema.js";

/** The previous link in the amendment chain: the last amendment's own hash,
 * or (for the first amendment ever appended to this record) the record's
 * own `chain.recordHash` — the base record is every amendment chain's
 * genesis. */
export function previousAmendmentHash(record: RunRecord): string {
  const last = record.amendments.at(-1);
  return last?.amendmentHash ?? record.chain.recordHash;
}

export function computeAmendmentHash(amendment: Omit<Amendment, "amendmentHash">, prevHash: string): string {
  return sha256Hex(canonicalJson({ ...amendment, prevAmendmentHash: prevHash } as unknown as Json));
}

/** Append one amendment to `record`, returning a NEW record value (the
 * input is never mutated). Every other field, including `chain`, is
 * byte-identical to `record` — only `amendments` grows. */
export function appendAmendment(record: RunRecord, amendment: Omit<Amendment, "amendmentHash">): RunRecord {
  const prevHash = previousAmendmentHash(record);
  const amendmentHash = computeAmendmentHash(amendment, prevHash);
  return { ...record, amendments: [...record.amendments, { ...amendment, amendmentHash }] };
}
