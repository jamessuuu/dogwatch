/**
 * The ONE place `sluice.gates.decide`/`cancel` is ever called from (SPEC §5
 * step 4: three decision channels, ALL writing through `sluice.gates.decide`
 * and all recorded with `decisionChannel`). `apps/web`'s
 * `/api/gate/decide` route, `resume.yml`'s `workflow_dispatch` handler
 * (via `dogwatch gate decide --channel workflow_dispatch`), and
 * `dogwatch gate decide`'s local break-glass path all call this same
 * function with a different `channel` — the `decidedBy` convention
 * `gate-entry.ts` reads back out to populate `GateEntry.decisionChannel`.
 */
import type { GateRecord as SluiceGateRecord, Sluice } from "@jamessuuu/sluice";
import type { DecisionChannel } from "../record/schema.js";

export interface DecideInput {
  sluice: Sluice;
  gateId: string;
  decision: "approve" | "reject";
  channel: DecisionChannel;
  /** e.g. the GitHub Actions actor for `workflow_dispatch`, the OS user for
   * `cli`. Absent for `token` (SPEC's auth model: the token proves
   * authorization, not identity — "decision channel + IP hash are
   * recorded", and the IP hash is the API route's own concern, not this
   * function's). */
  actor?: string | undefined;
  reason?: string | undefined;
  /** Required for `channel === "token"`; absent for the other two — sluice
   * itself already enforces this at the type level (`GatesApi.decide`'s
   * `token` param is optional, and a `token:"approve"` presented for a
   * non-token channel would just fail sluice's own HMAC verification, so
   * this function does not duplicate that validation). */
  token?: string | undefined;
}

function decidedByOf(channel: DecisionChannel, actor: string | undefined): string {
  return actor === undefined || actor.length === 0 ? channel : `${channel}:${actor}`;
}

export function decideGate(input: DecideInput): Promise<SluiceGateRecord> {
  return input.sluice.gates.decide({
    id: input.gateId,
    decision: input.decision,
    decidedBy: decidedByOf(input.channel, input.actor),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.token === undefined ? {} : { token: input.token }),
  });
}
