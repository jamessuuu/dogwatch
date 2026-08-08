# src/effects — the gate kernel (SPEC §12 M5)

sluice wiring for anything that leaves the dogwatch repo — implemented:

| Module | Owns |
|---|---|
| `propose.ts` | confirmed finding → `gates.open` → notify (SPEC §5 steps 1-3) |
| `decide.ts` | the ONE place `sluice.gates.decide`/`cancel` is called — all three decision channels go through it |
| `gate-entry.ts` | sluice `GateRecord` ⇄ dogwatch `GateEntry`, including `decisionChannel` recovery |
| `execute.ts` | the approved action's governed effect, exactly once (`sluice.run`, intent-derived key) |
| `reconcile.ts` | SPEC §9's indeterminate-issue-creation reconciliation |
| `resume.ts` | sweep timeouts → claim decided → execute → amend → close notification (`dogwatch resume`) |
| `notify.ts` | `PublicGateSummary` (no token field, type-enforced) + the webhook composer (the only token-bearing one) |
| `github-transport.ts` | `GithubTransport` — `FakeGithubTransport` (every test) / `RealGithubTransport` (runtime only) |
| `resume-context.ts` | the Zod-validated payload stamped into `gates.open({resumeContext})` |

See [docs/SPEC.md §5](../../../../docs/SPEC.md) ("Gate flow, end to end"),
§9 (failure contracts), and §12's M5 row. `scenarios.test.ts` is the SPEC
§11.4 scenario suite; `propose.test.ts`/`execute` are covered via
`reconcile.test.ts` and `../record/build-run.test.ts`'s M5 integration case.

Issue drafts are deterministic templates, not LLM-authored — see
`propose.ts`'s header comment for why (`llm/draft.ts` stays wired-but-
unreachable, `llm/unreachable.test.ts` unchanged).
