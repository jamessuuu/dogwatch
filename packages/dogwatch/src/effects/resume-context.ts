/**
 * The shape stamped into `sluice.gates.open({ resumeContext })` (SPEC §5
 * step 2) — "what a NEW process needs to continue" (sluice's own doc
 * comment on `GateSpec.resumeContext`). Zod-validated on the way back out
 * in `cli/resume.ts` (HARD RULE: Zod at every boundary) since a gate's
 * `resumeContext` travels through the store as opaque `Json`.
 */
import { z } from "zod";

export const ResumeContextSchema = z.strictObject({
  runId: z.string().min(1),
  recordPath: z.string().min(1),
  actionId: z.string().min(1),
  effectKey: z.string().min(1),
  /** "owner/repo" the approved action targets — carried alongside the
   * effect key so `execute.ts` never has to re-derive it from the action id
   * or re-read the run record just to know where to open the issue. */
  targetRepo: z.string().min(1),
});
export type ResumeContext = z.infer<typeof ResumeContextSchema>;
