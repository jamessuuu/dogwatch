# src/llm — landed at M3

Two possible model calls, both advisory, neither able to gate anything
(SPEC §8):

- **`triage.ts`** — Haiku 4.5, forced tool schema, Zod-validated on the way
  back. Runs whenever `findings.length > 0` and a client + daily budget are
  available. `proposedAction` is displayed and ignored — `pipeline.ts`'s
  caller (`record/build-run.ts`) never reads it to decide anything; the
  deterministic rule table already decided severity/hysteresis before this
  module runs at all.
- **`draft.ts`** — fully wired (real types, real Zod schema, a real forced-
  tool call), but unreachable: gates land at M5
  (`src/effects/README.md`), so nothing in this build ever calls it.
  `unreachable.test.ts` greps the production source tree and fails the
  build if that ever stops being true.

`client.ts` is the **only file in the whole pipeline** permitted to import
`@anthropic-ai/sdk` — the `Finding` type itself does not admit a free-text
field a model could fill in (R13), so even a bug here can only produce
`advisory.note` / `draft.title` / `draft.body`, both explicitly labelled and
both requiring a human's approval (draft) or carrying no authority at all
(advisory) before anything public happens.

**No live API call anywhere in tests or in this build.** Every test uses
`test-helper.ts`'s `FakeLlmClient`. `cli/watch.ts` only constructs a real
`AnthropicLlmClient` when `ANTHROPIC_API_KEY` is present in the environment
— James has not approved spend, so this code ships ready and unexecuted.

`budget.ts` is the D2 app-level counter (`dogwatch_budget`, SPEC §3),
checked **before** every call. `InMemoryBudgetStore` is the M0-M3 default —
honest about being per-process, not per-day, until M4 wires a real Postgres
connection (`PostgresBudgetStore` is fully written now against a minimal
injectable `SqlExecutor`, activated by `createBudgetStore({databaseUrl,
sqlExecutor})`).

Cost is computed in integer micro-USD from provider-reported usage ×
`pricing.<date>.json` (`cost.ts`) — never a constant.

## Degrade path

Cap trip, API error (including "no credentials configured"), schema-invalid
output (including our own post-validation: referenced finding ids and note
URLs must exist in the record's evidence), or a caller-side timeout all
degrade to the deterministic summary standing alone, with
`degraded:[{component:"llm", reason:...}]` published. See `pipeline.test.ts`
for one test per degrade reason.
