# dogwatch — OPERATIONS

Scope note: this document currently covers what M5 (the gate kernel) needs an
operator to know — the `/api/gate/decide` protections and the `resume.yml`
polling economics they're built around. The fuller M6 operations doc (Neon
CU-hour math end-to-end, full secrets inventory, fork-and-operate) lands with
the site-polish milestone; this file grows additively, never rewritten.

## `/api/gate/decide` — the one write path (SPEC §6)

Three independent layers, in the order a request meets them:

1. **Hobby WAF rate-limit rule.** Vercel Firewall config (dashboard or
   `vercel.json`'s `firewall` block, not this repo's application code) —
   **5 requests/minute per IP, scoped to `/api/gate/decide` only.** This is
   the one Hobby-plan WAF rule this project spends, deliberately: the model
   path (triage/draft) is never reachable from the web at all, so this route
   is the entire public attack surface worth a rate limit.
2. **App-level daily counter.** `dogwatch_budget.decide_attempts` — every
   POST increments it (successful or not; the counter bounds request
   *volume*, not successful decisions), checked *before* attempting the
   decision. **200 attempts/day → HTTP 429.** Read/write via
   `packages/dogwatch/src/store/decide-attempts.ts`.
3. **The decision itself.** Zod-parsed body (`{gateId, decision, token,
   reason?}`), a single-use HMAC token verified timing-safely by sluice's own
   `gates.decide` (never reimplemented here — SPEC §1 non-goal 4). An
   invalid, expired, or mismatched-gate token returns `401 E_BAD_TOKEN`. A
   second decide attempt on an already-decided gate is idempotent (sluice's
   F6: first writer wins) — it returns the recorded decision, not an error.

None of this runs if `DATABASE_URL`/`APPROVAL_SECRET` are not configured —
the route returns `503 E_STORE` rather than accepting a decision it cannot
durably record or authenticate (fail closed, SPEC §9).

## Three decision channels (SPEC §5 step 4)

| Channel | Where | Auth | Needs Vercel? |
|---|---|---|---|
| `token` | `POST /api/gate/decide` | single-use HMAC token | yes |
| `workflow_dispatch` | `resume.yml`'s manual trigger | GitHub repo permissions | no |
| `cli` | `dogwatch gate decide` | local shell access (break-glass) | no |

Every channel calls the SAME function, `src/effects/decide.ts`'s
`decideGate` — the `decidedBy` string it writes (`"<channel>[:<actor>]"`) is
how `GateEntry.decisionChannel` gets recovered later
(`src/effects/gate-entry.ts`). If Vercel is down (D3), decisions still route
through (b) or (c) — the `token` channel is the only one that stops working.

## `resume.yml` polling economics (SPEC §5's Neon CU-hour argument)

`*/30 * * * *` is 48 wakes/day. Neon Free is 100 CU-hours/month. The design
that keeps this cheap: **the poller reads git before it reads Postgres.**
`resume.yml`'s own first step reads the COMMITTED `state/pending-gates.json`
(zero network calls) and exits in ~5s, touching nothing else, whenever it is
empty — which is every wake except the ones following a night `watch.yml`
actually opened a gate. `dogwatch resume` repeats the same check internally
(belt-and-suspenders — direct invocations skip the workflow's own fast path).
Quiet nights: one wake, no Postgres connection at all. A gate night: bounded
polling until the 48h timeout or a human decides, whichever comes first.

## Secrets this workflow needs

| Secret | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `resume.yml`, `/api/gate/decide` | Neon connection string |
| `APPROVAL_SECRET` | both | HMAC key for `gates.mintToken`/`gates.decide({token})` |
| `DOGWATCH_ISSUES_TOKEN` | `resume.yml` | fine-grained PAT: `issues:write` on the five sibling repos + `contents:write` on dogwatch only (SPEC §14 Q3) |
| `NOTIFY_WEBHOOK_URL` | `watch.yml` (optional) | ntfy/Discord — exercises the tokenized-link path in production |

## No auto-approve path

There is no code path anywhere in `src/effects` that sets a gate's
`onTimeout` to `"approve"` — every gate `propose.ts` opens uses sluice's own
default (`"reject"`, fail-closed). `src/effects/scenarios.test.ts` asserts
this directly.
