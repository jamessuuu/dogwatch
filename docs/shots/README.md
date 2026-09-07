# Design pass, 2026-09-07 — before / after

Rendered from `next start` against the real production build, Chromium,
`deviceScaleFactor: 1`, full page. Regenerate with:

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

## What changed

| | before | after |
|---|---|---|
| box-shadowed nodes | 0 | 39 |
| elements with transitions | 0 | 39 |
| elements animating | 0 | 6 |
| border radii in use | none | 10px / 8px / 6px / 2px |
| largest rendered type | 30px | 60px |
| type families | 2 system stacks | Archivo 220 · Commit Mono 176 · Newsreader 1 |
| home page height @1440 | 2982px | 6450px |
| `/runs/<id>` PNG width @390 | **533px** (horizontal scroll) | 390px |
| project-gate | 5 hard failures | 21/21, no warnings |

The height increase is the point: the page previously rendered one line of a
month-long history.

## Measuring

`scripts/measure.mjs` prints the numeric profile above from a rendered page:

```bash
M_W=1440 node scripts/measure.mjs
```
