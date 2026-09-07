# Design pass, 2026-09-07 — before / after

`before-*` and `after-*` are rendered from `next start` against the real
production build; `live-*` are fetched from the deployed site. Chromium,
`deviceScaleFactor: 1`, full page.

```bash
pnpm --filter @dogwatch/web build
cd apps/web && npx next start -p 4177 &
SHOT_BASE=http://127.0.0.1:4177 SHOT_TAG=after SHOT_DIR=docs/shots node scripts/shots.mjs
```

`scripts/shots.mjs` prints the real PNG pixel width from the file's IHDR
header, not just `document.scrollWidth` — a decorative layer can widen the
rendered page while every element's `scrollWidth` still reads clean. That is
not hypothetical: the ambient wash added in this pass bled the page to 419px
at a 390px viewport on its first draft, and `scrollWidth` reported 390.

## Measured, rendered

| | before | after |
|---|---|---|
| box-shadowed nodes | 0 | 39 |
| elements with transitions | 0 | 39 |
| elements animating | 0 | 6 |
| border radii in use | none | 10px / 8px / 6px / 2px |
| largest rendered type @1440 | 30px | 60px |
| largest rendered type @390 | — | 42px |
| type families | 2 system stacks | Archivo 220 · Commit Mono 176 · Newsreader 1 |
| `mix-blend-mode` / `backdrop-filter` | 0 / 0 | 0 / 0 |
| side-bordered cards, emoji icons | 0 / 0 | 0 / 0 |
| home page height @1440 | 2982px | 6450px |
| `/runs/<id>` PNG width @390 | **533px** (horizontal scroll) | 390px |
| project-gate | 5 hard failures, 3 warnings | 21/21, none |

The height increase is the point: the page previously rendered one line of a
month-long published history.

Blend modes and `backdrop-filter` stay at zero deliberately — both were
measured elsewhere in this portfolio at 60 → 47.8fps and 60 → 44.7fps. The
ambient wash is a plain radial gradient at 7%, which costs nothing.

## Tooling added in this pass

| script | what it proves |
|---|---|
| `scripts/shots.mjs` | the real PNG width, not just `scrollWidth` |
| `scripts/measure.mjs` | the numeric design profile of a rendered page |
| `scripts/font-check.mjs` | the vendored faces actually load and compute on a live URL |
| `scripts/live-check.mjs` | the deployed page WORKS — clicks Verify, listens for `pageerror` |
| `scripts/falsify.mjs` | every `*:check` can go red when a defect is planted |
| `scripts/motion-check.mjs` | all motion actually stops under `prefers-reduced-motion` |

`falsify.mjs` is the important one. A checker that silently matches nothing
reports "no drift", which is indistinguishable from a clean pass — the exact
failure dogwatch's own rubric exists to catch in published records. All five
proved they can fail, including the chain check behind the landing page's
"24/24 hash links verified".

Reduced motion is verified the same way — by rendering, not by reading
the stylesheet. Tailwind's `transition-*` utilities are not wrapped in the
media query, so a correct-looking reduced-motion block still left 7
transitions running at 150ms on the deployed page. Measured now:

| context | transitions | animating |
|---|---|---|
| normal | 39 | 6 |
| `prefers-reduced-motion: reduce` | 0 | 0 |

## Routes

| route | before | after |
|---|---|---|
| `/` | one line about last night | 23 nights, the chart, the chain, the six surfaces, the cost |
| `/runs/<id>` | id + metadata, then 121 rows | a six-cell summary first; 533px mobile overflow fixed |
| `/methodology` | a rubric table and four prose blocks | 15 rules each linked to the planted record that proves it fires; prose behind disclosure |
| `/checks` | hairline list of families | leads with what is registered and NOT built; families as panels |
| `/docs` | long-form reference | unchanged — still prose-heavy, see the handover |

`/methodology`'s fixture links are checked at build in both directions: a
dead link fails the build, and so does a committed fixture the rubric has
stopped covering. Proved by planting `r99-does-not-exist`.

The rubric -> fixture -> Verify chain is asserted end to end by the e2e
suite and re-checked on the deployed build: clicking R13's planted record
and pressing Verify yields `data-verify-state="fail"` with
`E_MANUFACTURED_FINDING`.
