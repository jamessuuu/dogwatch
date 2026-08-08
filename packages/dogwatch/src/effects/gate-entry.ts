/**
 * sluice `GateRecord` → dogwatch `GateEntry` (SPEC §3 schema.ts). Shared by
 * `propose.ts` (a freshly-opened or idempotently-returned gate) and
 * `resume.ts` (a just-decided gate, about to be published in an amendment).
 *
 * `decisionChannel` (SPEC §5 step 4's three channels) is NOT something
 * sluice's own `GateRecord` tracks — it has no concept of "how" a decision
 * arrived, only who (`decidedBy`) and when. dogwatch's own `decide.ts`
 * (the ONLY place `sluice.gates.decide`/`cancel` is ever called) adopts the
 * convention `decidedBy = "<channel>[:<actor>]"`; this module recovers
 * `decisionChannel` by reading that convention back out — one producer
 * (`decide.ts`), one consumer (here), never duplicated.
 */
import type { GateRecord as SluiceGateRecord } from "@jamessuuu/sluice";
import type { DecisionChannel, GateEntry } from "../record/schema.js";

const KNOWN_CHANNELS: ReadonlySet<string> = new Set(["token", "workflow_dispatch", "cli"]);

export function decisionChannelOf(decidedBy: string | null): DecisionChannel | undefined {
  if (decidedBy === null) return undefined;
  const prefix = decidedBy.split(":")[0];
  return prefix !== undefined && KNOWN_CHANNELS.has(prefix) ? (prefix as DecisionChannel) : undefined;
}

export function toGateEntry(record: SluiceGateRecord): GateEntry {
  const channel = decisionChannelOf(record.decidedBy);
  return {
    id: record.id,
    key: record.key,
    status: record.status,
    openedAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    ...(record.decidedAt === null ? {} : { decidedAt: new Date(record.decidedAt).toISOString() }),
    ...(record.decidedBy === null ? {} : { decidedBy: record.decidedBy }),
    ...(channel === undefined ? {} : { decisionChannel: channel }),
    ...(record.decisionReason === null ? {} : { reason: record.decisionReason }),
  };
}
