/**
 * Gate-flow diagram — the ONE diagram DESIGN-DIRECTION.md names for dogwatch:
 * "propose -> gate opened -> decide (three channels) -> execute exactly
 * once, with the timeout edge going to REFUSED in amber, because that one
 * edge *is* the argument." Fail-closed — refusing by default when nobody
 * decides — is dogwatch's central claim, so it is the single amber signal
 * in a diagram that is otherwise pure ink.
 *
 * Deterministic by construction, same discipline as scripts/brand.mjs: no
 * Math.random, no @font-face / webfont, no network, no date stamping. Same
 * input, same bytes, forever — which is what lets CI diff the output and
 * fail on drift (scripts/diagram-check.mjs, mirroring brand-check.mjs).
 *
 * Text uses the OS's own font stacks (identical to apps/web/app/globals.css
 * --font-sans / --font-mono) rather than a downloaded font file — "no
 * webfont" means no @font-face fetch, not "no system text". The brand
 * glyphs draw pure geometry instead because a 64px icon has no room for
 * prose; a flow diagram with real channel names and code identifiers does,
 * and hand-drawing a dot-matrix font for every code snippet here would be
 * unreadable at this scale.
 *
 * Usage: node scripts/diagram.mjs [--out=<file>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// docs/DESIGN.md / BRAND-KIT.md palette. Do not invent colours.
const PAPER = "#FAF7F2";
const INK = "#1A1712";
const AMBER = "#B45309";
const INK_MUTED = "#6B6154"; // apps/web/app/globals.css --color-ink-muted

const SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, "Cascadia Code", "SF Mono", "Roboto Mono", Consolas, "Liberation Mono", monospace`;

const STROKE = 2; // standard stroke — same proportion as brand.mjs's SW at this larger canvas

const W = 1140;
const H = 460;

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A node box: paper fill, ink stroke, 0 radius (BRAND-KIT: no "friendly" rounded corners). */
function box(x, y, w, h, stroke = INK) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}" stroke="${stroke}" stroke-width="${STROKE}"/>`;
}

function text(x, y, s, { size = 15, weight = 600, family = SANS, fill = INK, anchor = "middle", tracking } = {}) {
  const ls = tracking !== undefined ? ` letter-spacing="${tracking}"` : "";
  return `<text x="${x}" y="${y}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}>${esc(s)}</text>`;
}

/** Orthogonal (right-angle) connector — the schematic-bus look, ink strokes only. */
function polyline(points, color, width = STROKE) {
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
}

/** Small filled triangle, tip at (x,y), pointing `dir`. No gradients, flat fill only. */
function arrowHead(x, y, dir, color) {
  const s = 10;
  const shapes = {
    right: `${x},${y} ${x - s},${y - 6} ${x - s},${y + 6}`,
    left: `${x},${y} ${x + s},${y - 6} ${x + s},${y + 6}`,
    down: `${x},${y} ${x - 6},${y - s} ${x + 6},${y - s}`,
    up: `${x},${y} ${x - 6},${y + s} ${x + 6},${y + s}`,
  };
  return `<polygon points="${shapes[dir]}" fill="${color}"/>`;
}

/** points -> polyline + arrowhead at the final point, in the direction of the final segment. */
function arrow(points, color, width = STROKE) {
  const [px, py] = points.at(-2);
  const [x, y] = points.at(-1);
  const dir = x > px ? "right" : x < px ? "left" : y > py ? "down" : "up";
  return polyline(points, color, width) + arrowHead(x, y, dir, color);
}

function buildDiagram() {
  const parts = [];

  // ---- row 1: the main flow --------------------------------------------
  const row1Y = 32;
  const row1H = 72;
  const row1Bottom = row1Y + row1H;
  const row1Mid = row1Y + row1H / 2; // 68

  const propose = { x: 40, y: row1Y, w: 160, h: row1H };
  const gateOpened = { x: 240, y: row1Y, w: 200, h: row1H };
  const decide = { x: 590, y: row1Y, w: 160, h: row1H };
  const execute = { x: 810, y: row1Y, w: 260, h: row1H };
  const cx = (b) => b.x + b.w / 2;

  for (const b of [propose, gateOpened, decide, execute]) parts.push(box(b.x, b.y, b.w, b.h));

  parts.push(text(cx(propose), row1Y + 30, "PROPOSE", { size: 15 }));
  parts.push(text(cx(propose), row1Y + 54, "finding → action", { size: 11, weight: 400, family: MONO, fill: INK_MUTED }));

  parts.push(text(cx(gateOpened), row1Y + 30, "GATE OPENED", { size: 15 }));
  parts.push(text(cx(gateOpened), row1Y + 54, "gates.open() · 48h timer", { size: 11, weight: 400, family: MONO, fill: INK_MUTED }));

  parts.push(text(cx(decide), row1Y + 30, "DECIDE", { size: 15 }));
  parts.push(text(cx(decide), row1Y + 54, "gates.decide()", { size: 11, weight: 400, family: MONO, fill: INK_MUTED }));

  parts.push(text(cx(execute), row1Y + 30, "EXECUTE", { size: 15 }));
  parts.push(text(cx(execute), row1Y + 54, "sluice.run() · exactly once", { size: 11, weight: 400, family: MONO, fill: INK_MUTED }));

  // main-flow arrows
  parts.push(arrow([[propose.x + propose.w, row1Mid], [gateOpened.x, row1Mid]], INK));
  parts.push(arrow([[gateOpened.x + gateOpened.w, row1Mid], [decide.x, row1Mid]], INK));
  parts.push(arrow([[decide.x + decide.w, row1Mid], [execute.x, row1Mid]], INK));
  parts.push(
    text((decide.x + decide.w + execute.x) / 2, row1Mid - 10, "approve", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED })
  );

  // ---- row 2: the three decision channels, fanning into DECIDE ---------
  const row2Y = 200;
  const row2H = 80;
  const chanA = { x: 325, y: row2Y, w: 210, h: row2H };
  const chanB = { x: 565, y: row2Y, w: 210, h: row2H };
  const chanC = { x: 805, y: row2Y, w: 210, h: row2H };
  const trunkX = cx(chanB); // = cx(decide) = 670, by construction

  parts.push(
    text(trunkX, row2Y - 14, "DECISION — THREE CHANNELS, ONE GATE", {
      size: 10.5,
      weight: 600,
      family: MONO,
      fill: INK_MUTED,
      tracking: "0.04em",
    })
  );

  for (const b of [chanA, chanB, chanC]) parts.push(box(b.x, b.y, b.w, b.h));

  parts.push(text(cx(chanA), row2Y + 22, "(a) WEB", { size: 13 }));
  parts.push(text(cx(chanA), row2Y + 42, "POST /api/gate/decide", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));
  parts.push(text(cx(chanA), row2Y + 60, "single-use HMAC token", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));

  parts.push(text(cx(chanB), row2Y + 22, "(b) MOBILE / CI", { size: 13 }));
  parts.push(text(cx(chanB), row2Y + 42, "workflow_dispatch", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));
  parts.push(text(cx(chanB), row2Y + 60, "resume.yml, no token", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));

  parts.push(text(cx(chanC), row2Y + 22, "(c) CLI", { size: 13 }));
  parts.push(text(cx(chanC), row2Y + 42, "dogwatch gate decide", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));
  parts.push(text(cx(chanC), row2Y + 60, "break-glass (recorded)", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));

  // fan-in bus: two stems + one shared rail + one trunk into DECIDE's underside
  const busY = 160;
  parts.push(polyline([[cx(chanA), row2Y], [cx(chanA), busY]], INK));
  parts.push(polyline([[cx(chanC), row2Y], [cx(chanC), busY]], INK));
  parts.push(polyline([[cx(chanA), busY], [cx(chanC), busY]], INK));
  parts.push(arrow([[trunkX, row2Y], [trunkX, row1Bottom]], INK));

  // ---- row 3: REFUSED, the terminal fail-closed state -------------------
  const row3Y = 340;
  const row3H = 80;
  const refused = { x: 570, y: row3Y, w: 200, h: row3H };
  parts.push(box(refused.x, refused.y, refused.w, refused.h));
  parts.push(text(cx(refused), row3Y + 32, "REFUSED", { size: 16 }));
  parts.push(text(cx(refused), row3Y + 56, "reject, or 48h with no decision", { size: 10.5, weight: 400, family: MONO, fill: INK_MUTED }));

  // reject path (ink): DECIDE's right edge, routed clockwise around EXECUTE
  // and the channel row to REFUSED's right edge.
  const rejectExitX = decide.x + decide.w - 20; // 730
  const rejectMidY = 130;
  const rejectFarX = 1095;
  const rejectRowY = row3Y + row3H / 2; // 380
  parts.push(
    arrow(
      [
        [rejectExitX, row1Bottom],
        [rejectExitX, rejectMidY],
        [rejectFarX, rejectMidY],
        [rejectFarX, rejectRowY],
        [refused.x + refused.w, rejectRowY],
      ],
      INK
    )
  );
  parts.push(text(rejectExitX + 14, rejectMidY - 8, "reject", { size: 11, weight: 400, family: MONO, fill: INK_MUTED, anchor: "start" }));

  // ---- timeout path (AMBER): the one signal in this diagram -------------
  // 48h with no decision fires from the OPEN gate itself, not from a human
  // decision — it never touches DECIDE at all, which is the point: refusal
  // is what happens by default, not a choice anyone makes.
  const timeoutExitX = cx(gateOpened); // 340
  const timeoutMidY = 150;
  const timeoutFarX = 150;
  const timeoutRowY = row3Y + row3H / 2; // 380
  parts.push(
    arrow(
      [
        [timeoutExitX, row1Bottom],
        [timeoutExitX, timeoutMidY],
        [timeoutFarX, timeoutMidY],
        [timeoutFarX, timeoutRowY],
        [refused.x, timeoutRowY],
      ],
      AMBER
    )
  );
  parts.push(
    text((timeoutExitX + timeoutFarX) / 2, timeoutMidY - 8, "48h · no decision", {
      size: 11,
      weight: 600,
      family: MONO,
      fill: AMBER,
      anchor: "middle",
    })
  );

  // ---- caption ------------------------------------------------------------
  parts.push(
    text(W / 2, H - 14, "Amber: the only edge that fires with no human on it. Silence refuses — nothing auto-approves.", {
      size: 11.5,
      weight: 400,
      family: SANS,
      fill: INK_MUTED,
    })
  );

  const title = "The dogwatch gate flow";
  const desc =
    "A confirmed finding is proposed as an action. Opening the gate starts a 48-hour timer and " +
    "notifies through an issue in dogwatch's own repo, plus an optional webhook. A human decides " +
    "through one of three channels — a single-use HMAC token on the web, a GitHub Actions " +
    "workflow_dispatch usable from the mobile app with no token, or the CLI as a recorded break-glass " +
    "— all converging on one decision. Approval executes the action exactly once through sluice's " +
    "idempotent effect runner. Rejection refuses it. So does 48 hours passing with no decision at all: " +
    "that timeout path, drawn in amber, is the only edge in this diagram that fires without a human " +
    "choosing anything — fail-closed is what happens when nobody acts, which is the whole argument.";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="dw-diagram-title dw-diagram-desc">
<title id="dw-diagram-title">${esc(title)}</title>
<desc id="dw-diagram-desc">${esc(desc)}</desc>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
${parts.join("\n")}
</svg>
`;
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const outPath = args.out ?? "apps/web/public/diagram/gate-flow.svg";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildDiagram());
  console.log(`diagram: wrote ${outPath}`);
}

main();
