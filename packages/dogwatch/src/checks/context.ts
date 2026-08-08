/** Shared pure-rule context (SPEC §4 / R13 — see checks/types.ts doc comment
 * for why `evidence` is understood to travel with its sibling request +
 * observedAt facts when a template needs them). */
export interface RuleContext {
  targetId: string;
  checkId: string;
  request: { method: string; url: string };
  observedAt: string;
}
