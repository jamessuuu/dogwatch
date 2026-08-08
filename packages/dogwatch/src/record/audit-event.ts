/** Shared sluice-AuditEvent → dogwatch-AuditEventRecord mapper — used by
 * both `build-run.ts` (this run's own slice) and `src/effects/resume.ts`
 * (an amendment's slice), so the two never define this shape twice. */
import type { AuditEvent } from "@jamessuuu/sluice";
import type { AuditEventRecord } from "./schema.js";

export function toAuditEventRecord(e: AuditEvent): AuditEventRecord {
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
