/**
 * Public surface consumed by `apps/web` (SPEC §10, M6). Everything
 * re-exported here is isomorphic (no `node:*` imports — SPEC §4's isolation
 * rule) so it bundles into a browser client component unmodified: the
 * `/runs/<id>` Verify button imports `verifyRecord`/`RULES_BY_ID` from here
 * to re-derive findings from evidence, and `verifyEvents` (re-exported from
 * `@jamessuuu/sluice`) to re-check the audit hash chain — both running with
 * zero server, exactly the code CI already runs offline.
 */
export * from "./record/schema.js";
export * from "./record/canonical.js";
export * from "./record/hash.js";
export * from "./record/index-schema.js";
export * from "./record/pending-gates.js";
export * from "./record/targets-schema.js";
export * from "./verify/rubric.js";
export * from "./verify/types.js";
export * from "./checks/index.js";
export { verifyEvents, type AuditEvent as SluiceAuditEvent, type VerifyEventsResult } from "@jamessuuu/sluice";
