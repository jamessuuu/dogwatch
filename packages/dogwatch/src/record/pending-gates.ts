/**
 * `state/pending-gates.json` (SPEC §5): the git-first artifact
 * `resume.yml` reads BEFORE touching Postgres at all — "the poller reads
 * git before it reads Postgres... quiet nights: one wake" (the Neon
 * CU-hour argument). Computed from every committed run record's EFFECTIVE
 * gate state (the same base-record-plus-amendment-overlay `verify/rubric.ts`
 * uses for R7/R8 — a gate decided via amendment is no longer pending, even
 * though its base-record entry still literally says "pending").
 */
import { z } from "zod";
import type { RunRecord } from "./schema.js";
import { relativeRunRecordPath } from "./run-path.js";

export const PendingGateEntrySchema = z.strictObject({
  gateId: z.string().min(1),
  runId: z.string().min(1),
  recordPath: z.string().min(1),
  key: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type PendingGateEntry = z.infer<typeof PendingGateEntrySchema>;

export const PendingGatesFileSchema = z.strictObject({
  formatVersion: z.literal(1),
  gates: z.array(PendingGateEntrySchema),
});
export type PendingGatesFile = z.infer<typeof PendingGatesFileSchema>;

export function computePendingGates(records: readonly RunRecord[]): PendingGateEntry[] {
  const out: PendingGateEntry[] = [];
  for (const record of records) {
    const overlay = new Map<string, RunRecord["gates"][number]>();
    for (const amendment of record.amendments) {
      for (const g of amendment.gates) overlay.set(g.id, g);
    }
    for (const g of record.gates) {
      const effective = overlay.get(g.id) ?? g;
      if (effective.status === "pending") {
        out.push({
          gateId: g.id,
          runId: record.runId,
          recordPath: relativeRunRecordPath(record.startedAt, record.runId),
          key: g.key,
          expiresAt: effective.expiresAt,
        });
      }
    }
  }
  return out;
}

export function buildPendingGatesFile(records: readonly RunRecord[]): PendingGatesFile {
  return { formatVersion: 1, gates: computePendingGates(records) };
}
