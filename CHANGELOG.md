# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: semver.

## [Unreleased]

### Added (M6)
- The site (`apps/web`, Next.js 16 App Router, React 19, TS strict +
  `noUncheckedIndexedAccess`, Tailwind 4 config-in-CSS). Every page
  prerendered from committed JSON at build time — `/`, `/runs`,
  `/runs/<id>`, `/checks`, `/methodology` — **zero route handlers** (the
  only one the product will ever have, `/api/gate/decide`, is M5).
- `/` — what the watch is, the last run in one line (checks · findings ·
  gates · cost), the dead-man banner, next expected run, links; renders
  with JavaScript disabled (verified by e2e).
- `/runs` — newest-first index; `quiet` is a first-class badge, not an
  apology.
- `/runs/<id>` — checks grouped by family (passes collapsed in a
  `<details>`, each still carrying its `curl` line), findings with sources
  and evidence paths, the absence-of-evidence block, actions/gates/refusals
  (explicit "None this run" when empty, never hidden), cost to four
  decimals, the audit events, raw-JSON (`<details>`) and GitHub-blob links,
  and a **Verify** button.
- The Verify button (`components/VerifyButton.tsx`, a client component)
  runs entirely in the browser: it Zod-parses the record already on the
  page, calls `verifyRecord(..., {rerunRules:true})` (re-deriving every
  finding from stored evidence via the same rule functions the runner
  used) and `verifyEvents` (sluice's own pure hash-chain verifier,
  independently, so the UI can label "chain re-verified" on its own) —
  zero server, the exact code CI already runs offline. Tested against a
  real record (green) and against `fixtures/violations/*.json` (red, one
  fixture per exact rubric code) via `/fixtures/<name>`, a page not linked
  from navigation, built the same way as every real run page.
- `/checks` — the catalog rendered straight from `CHECK_REGISTRY` (the
  same registry the runner reads), including unimplemented families with
  their landing milestone and reason — docs cannot drift because this page
  is not a description of the code, it renders the code's own data.
- `/methodology` — the R1–R15 rubric in prose, a link to
  `schemas/run-record.v1.json`, the anti-manufacture rule (R13), the
  advisory model's disagreement-rate publishing, the autonomy ladder, and
  Limitations (operated instance, six-surfaces-only, not-an-uptime-claim,
  metrics-never-findings) verbatim from SPEC §13.
- The dead-man banner (`lib/dead-man.ts` + `components/DeadManBanner.tsx`):
  pure, unit-tested at its exact >36h boundary (7 tests: just-under,
  exactly-36h, one-minute-over). Computed client-side, after mount, from
  the browser's own clock — never a value baked in at build time, which
  would be stale by the time a visitor loads the page. `<noscript>` always
  prints both raw timestamps.
- Footer (chip mark + "Built by James Lorenz Santos" + the agentjames
  backlink + the repo link, no hire-me CTA) and favicon/OG metadata
  (`/brand/favicon.svg`, `/brand/og.svg` — both from M0's
  `scripts/brand.mjs`, nothing new generated) on every page.
- `packages/dogwatch/src/index.ts` — the package's public barrel export
  (re-exports the isomorphic `record`/`verify`/`checks` modules plus
  sluice's `verifyEvents`), consumed by the site as compiled build output
  (`packages/dogwatch/dist`, via a relative import) rather than the bare
  `"dogwatch"` package specifier — Next's bundler (Turbopack and webpack
  alike, verified against 16.3.0) cannot transpile a NodeNext-resolution
  TypeScript source package across a workspace boundary via `export *`
  chains. `@jamessuuu/sluice` is aliased to its own build output the same
  way (`next.config.ts`, webpack `resolve.alias`). `scripts/build-native-
  deps.mjs` builds both — a small, portable Node wrapper (not a shell
  one-liner) so it runs identically on Windows and CI — before the site
  builds; `apps/web`'s own `build`/`dev` scripts call it first.
- Playwright e2e (`apps/web/e2e/smoke.spec.ts`, 13 tests) replaces the CI
  echo no-op: footer/favicon on every page, `/` with JS disabled, a run
  page showing checks/findings/absence/cost, the Verify button green on a
  real record and red on two different tampered fixtures, `/checks` and
  `/methodology` content. `ci.yml`'s `e2e-smoke` stage now runs it for
  real — sluice and dogwatch are built first (`build-native-deps.mjs`
  inside `apps/web`'s own `build` script), and Playwright's chromium is
  installed via `playwright install --with-deps`.
- Deviation from SPEC §10's full M6 row: `/gates` and `/gate` are not
  built — gates don't exist until M5 (every record's `gates: []`), so a
  `/gates` page would have nothing real to render; deferred with `/gates`
  rather than shipped as a permanently-empty page. `docs/OPERATIONS.md` is
  also not written this milestone (not requested).

### Added (M3)
- Advisory LLM (SPEC §8): `triage` (Haiku 4.5, forced tool schema
  `{advisorySeverity, note, referencedFindingIds, proposedAction}`,
  `max_tokens:800`, Zod-validated — `src/llm/triage.ts`) runs only when
  `findings.length > 0`; `proposedAction` is published but ignored, the
  deterministic rule table still decides everything. `draft` (`src/llm/draft.ts`)
  is fully wired — real types, real Zod schema, a real forced-tool call —
  but unreachable before M5's gate machinery exists; `unreachable.test.ts`
  greps the production source tree and fails the build if any caller ever
  shows up outside `src/llm`. `client.ts` is the only file permitted to
  import `@anthropic-ai/sdk`; every test uses `test-helper.ts`'s
  `FakeLlmClient` — **no live API call anywhere in tests or in this build**,
  and `cli/watch.ts` only constructs a real client when `ANTHROPIC_API_KEY`
  is present (James has not approved spend).
- `dogwatch_budget` counter behind a `BudgetStore` interface
  (`src/llm/budget.ts`): `InMemoryBudgetStore` is the M0-M3 default,
  honestly per-process (not per-day) until Neon lands at M4;
  `PostgresBudgetStore` is fully written now against a minimal injectable
  `SqlExecutor` (no new dependency for code nothing calls yet), activated by
  `createBudgetStore({databaseUrl, sqlExecutor})` — a `databaseUrl` with no
  executor throws rather than silently downgrading. Checked before every
  call against SPEC's daily ceiling (20 calls / 100k input / 20k output /
  $0.20).
- Degrade path (`src/llm/pipeline.ts`): daily cap, API error (including "no
  credentials configured"), schema-reject (Zod-invalid, or our own
  referencedFindingIds/URL-allowlist grounding check — the "fabricated
  link" catcher SPEC §8 names), or a caller-side timeout all degrade to the
  deterministic summary standing alone, `degraded:[{component:"llm",
  reason:...}]` published. One test per reason in `pipeline.test.ts`. A
  schema-rejected response still charges and records real provider-reported
  cost — the API call genuinely happened even though its content didn't
  validate.
- Cost accounting in integer micro-USD from provider-reported usage × the
  pricing manifest (`src/llm/cost.ts`, never a constant) — `pricing-schema.ts`
  + `pricing-io.ts` load and Zod-validate `pricing.<date>.json` the same way
  `targets.json` already does. Quiet nights remain exactly
  `llm:{calls:0, reason:"no_findings"}` and `microUsd 0`.
- `AdvisorySchema` gained `proposedAction` (record/schema.ts) — the triage
  tool's fourth output field, displayed for transparency, never consulted
  by any decision. Schema/fixtures/goldens regenerated (`pnpm schema:gen`,
  `gen-fixtures.mts`, `gen-goldens.mts`) — not hand-edited.
- 52 new unit tests (budget, cost, triage grounding/degrade, draft
  reachability, full pipeline degrade-path coverage). 181 unit + 24 eval
  tests, all gates green.

### Fixed
- **Link classification: bot-blocks were misreported as broken links.** The
  first published run reported `HEAD https://www.ebizolution.com/ → 403` and
  `HEAD https://www.linkedin.com/in/... → 999` as `link.broken` — both true
  statements about the request dogwatch made, but neither is evidence the
  link is dead: 999 is LinkedIn's own non-standard "no bots" status, and a
  bare 403/406/429 on a HEAD-only request is the shape of a WAF/anti-bot
  rule, not a broken resource. Publishing that as `link.broken` every night
  forever is the "scheduled noise" SPEC §2's honesty guards exist to
  prevent, and it would make the honest-quiet-night property meaningless.
  Added a distinct `link.unverifiable` rule (low severity, `src/checks/link.ts`):
  a HEAD response with a bot-block shape (403/406/429/999) is now retried
  once with GET (`src/record/build-site.ts`) before any classification is
  made, and **both observations are recorded as evidence** so the finding
  statement stays a literal statement about every request dogwatch made. A
  GET retry that succeeds (<400) means the link is alive and the server
  just mishandles HEAD — `pass`, not a finding. A GET retry that confirms
  404/410 means the link is genuinely dead — stays `link.broken`. Anything
  else (retry also blocked, retry errored, retry ambiguous) publishes
  `link.unverifiable` instead of asserting broken. 8 new unit tests cover
  the three classes (broken / unverifiable / head-unsupported-but-alive)
  with exact expected rule ids, plus two `buildRun`-level integration tests
  proving the retry orchestration actually fires. The flawed M2 run record
  (`2026-08-08-…d9e2…json`) could not be hand-edited without breaking R12/R13
  (SPEC §7), so it was regenerated: a fresh live run against the same
  `targets.json` full pack, chained onto the M1 walking-skeleton record,
  replaces it. Both ebizolution and LinkedIn now publish as
  `link.unverifiable` (their WAFs block the GET retry too — a real,
  low-severity, non-noisy statement) instead of `link.broken`.

### Added
- M2: full honesty rubric validator `dogwatch verify` (R1–R15, exact error
  codes, SPEC §7 — R11 calls `@jamessuuu/sluice`'s own `verifyEvents`, not a
  re-derived copy); `fixtures/violations/` — 16 planted records (R1 has two
  distinct failure codes) each failing with its exact code, generated by
  `scripts/gen-fixtures.mts` from one real record built through the actual
  pipeline; replay goldens (`quiet`, a planted-503 `findings` run) replayed
  through `buildRun` unmodified with a frozen clock + seeded ids to a
  byte-identical record (`scripts/gen-goldens.mts`,
  `evals/replay.eval.test.ts`); `header`, `brand`, `link`, `weight` check
  families as pure rule modules; `repo`/`pkg`/`artifact`/`watch` registered
  as stub entries with their landing milestone and reason; hysteresis
  (2-consecutive-run confirmation, `status:"unconfirmed"` on night one) in
  the record builder. 114 unit tests + 24 eval tests, all green. A second
  real run against the full 5-family pack over `targets.json` is committed
  — 73 checks, 2 real findings (external links returning bot-block
  responses to a HEAD request), 1 error, honestly published and rubric-clean.
- M1 (walking skeleton): `reach` check family over the six targets via
  `src/probe/http` (undici), each probe wrapped in `sluice.run()` on
  `MemoryStore` with `circuitKey = host`; the full §3 run-record shape;
  findings only via rule templates over recorded evidence (no free-text
  finding path exists in the type system — R13); `dogwatch watch
  [--dry-run] [--only <family>]` and `dogwatch render`. First real run
  committed at `runs/<year>/<date>-<runId>.json` (`--only reach`): the five
  undeployed sibling sites skipped `not_published` (verified live: these
  shared `*.vercel.app` subdomains already resolve to unrelated third-party
  projects — probing them for real would risk exactly the non-goal §1
  forbids, so the skip is config-driven, before any request is made, never
  response-driven), and a real passing `reach` result for the live
  `agentjames.vercel.app`.
- M0: pnpm workspace (`packages/dogwatch` private CLI, `apps/web` deferred
  workspace entry), TS strict + `noUncheckedIndexedAccess`, ESLint 9 flat
  config with the `src/checks` + `src/verify` no-node-builtins boundary
  rule, Vitest 4 unit+eval projects, CI (typecheck → lint → unit → e2e:smoke
  → eval, plus schema/render/brand drift gates and `verify --all
  --rerun-rules` over every committed record) checking sluice out as a
  sibling repo to resolve the unpublished `link:` dependency, MIT license
  with brand-asset carve-out, `targets.json`, `schemas/run-record.v1.json`
  (generated from the Zod source of truth), `docs/SECURITY.md`,
  `scripts/brand.mjs` (the showcase-program generator) + drift check,
  `apps/web/public/brand/*` (mark, glyph — a ship's bell, one amber
  clapper — favicon, lockup, OG image). `.github/workflows/watch.yml` and
  `resume.yml` are deferred until after James decides the deploy trigger
  (SPEC §14 Q4) — `ci.yml` only for now.

### Fixed (salvaged from the interrupted `wip/m0-m1` build)
- `src/record/build-run.ts`: the injected sluice `clock.sleep` resolved
  instantly instead of using a real timer, turning `execute()`'s internal
  heartbeat loop into a synchronous busy-spin that starved the very probe
  call it was meant to supervise — every real `dogwatch watch` invocation
  hung indefinitely. Now delegates to sluice's own `systemClock.sleep`
  (real timers) while `now()` stays the injected/frozen clock for record
  timestamps.
- `src/record/build-run.ts`: sluice's default `maxResultBytes` (64 KiB) is
  far below a real HTML page (agentjames.vercel.app's homepage is ~84 KB),
  so every probed page silently became `resultOmitted: true` and crashed
  the pipeline reading `.finalUrl` off `undefined`. Raised to 4 MB;
  `src/record/sluice-probe.ts` also now throws a typed `ProbeError` instead
  of crashing if a result is ever still omitted, so the failure surfaces as
  a machine-readable `error` check, never an unhandled exception.
- `src/probe/html.ts`: `containsBacklink` resolved every relative href
  against the *target* host instead of the crawled page's own URL, so a
  page with no real backlink at all (e.g. a plain `<a href="/about">`) was
  misreported as linking back to agentjames — caught by a unit test, not
  inspection. Now takes the page's own URL and resolves against it.
- `src/verify/rubric.ts` (R13): re-derivation unconditionally re-ran every
  check's rule function, including checks that were never rule-evaluated in
  the real pipeline (`not_published`/`circuit_open`/`rate_limited` skips,
  and every probe-failure `error`) — these carry empty evidence by
  construction, so re-deriving them always disagreed with the stored
  verdict. Now excluded from R13's rerun, since there is no finding at
  stake for a check the rule function never touched.
- `undici`/TypeScript fixes in `src/probe/http.ts` (redirect-following no
  longer references undici's removed `maxRedirections` option; body
  draining now uses async iteration instead of a `.dump()` call the current
  undici types don't expose) and `exactOptionalPropertyTypes` fixes in
  `src/probe/crawl.ts` and `src/record/sluice-probe.ts` (the `Json`-typed
  boundary sluice's `run<T extends Json>` needs at the probe/effect edge).
