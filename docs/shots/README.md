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

`falsify.mjs` is the important one. A checker that silently matches nothing
reports "no drift", which is indistinguishable from a clean pass — the exact
failure dogwatch's own rubric exists to catch in published records. All five
proved they can fail, including the chain check behind the landing page's
"24/24 hash links verified".
