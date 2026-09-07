/* global document */
/**
 * Which rendered characters fall outside the vendored fonts' subset?
 *
 * The three portfolio faces are subset to the Google Fonts "latin" range,
 * and their `@font-face` blocks declare that range explicitly. A character
 * outside it is never even attempted in Archivo/Commit Mono/Newsreader — the
 * browser goes straight to the next font in the stack, which on the
 * visitor's machine is whatever system font happens to cover it. For common
 * punctuation that is harmless. For a rare dingbat it is tofu.
 *
 * This is invisible from a dev machine, because a dev machine has the
 * glyph. So it is checked against the DECLARED unicode-range rather than
 * against what happens to render here.
 *
 *   GC_BASE=https://dogwatch-two.vercel.app node scripts/glyph-check.mjs
 */
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.env.GC_BASE ?? "http://127.0.0.1:4177";
const ROUTES = ["/", "/runs", "/checks", "/methodology", "/docs", "/runs/01a077c2-cc0e-7f59-8d92-59f00faaa640"];

// Parse the range out of the stylesheet itself, so this cannot drift from
// what the @font-face blocks actually declare.
const cssPath = fileURLToPath(new URL("../apps/web/app/globals.css", import.meta.url));
const css = readFileSync(cssPath, "utf8");
const match = /unicode-range:\s*([^;]+);/.exec(css);
if (match === null) throw new Error("glyph-check: no unicode-range found in globals.css");

const ranges = match[1]
  .split(",")
  .map((p) => p.trim().replace(/^U\+/i, ""))
  .map((p) => {
    if (p.includes("-")) {
      const [a, b] = p.split("-");
      return [parseInt(a, 16), parseInt(b, 16)];
    }
    const v = parseInt(p, 16);
    return [v, v];
  });

const inRange = (cp) => ranges.some(([a, b]) => cp >= a && cp <= b);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const found = new Map();

for (const route of ROUTES) {
  const res = await page.goto(base + route, { waitUntil: "networkidle" });
  if (res === null || res.status() >= 400) {
    console.log(`  ${route}: HTTP ${String(res?.status() ?? 0)} — skipped`);
    continue;
  }
  // Visible text only: `innerText` skips display:none, which is what a
  // reader actually sees.
  const text = await page.evaluate(() => document.body.innerText);
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x80) continue;
    if (inRange(cp)) continue;
    const key = cp;
    if (!found.has(key)) found.set(key, { ch, routes: new Set(), count: 0 });
    const e = found.get(key);
    e.routes.add(route);
    e.count += 1;
  }
}
await browser.close();

// Text characters that are allowed to fall through to a system font.
//
// These are semantic punctuation, not decorative marks: rendering them as
// SVG would break selection, copy-paste and screen-reader output, which is a
// worse outcome than a font fallback. All three are covered by every default
// sans on Windows, macOS, Linux and Android (Segoe UI, SF, DejaVu, Liberation,
// Noto, Roboto), so the fallback is cosmetic at most.
//
// A DECORATIVE mark does not belong here — it belongs in components/Marks.tsx
// as inline SVG. U+2691 BLACK FLAG and U+25B8 were on this page 23 times
// between them and are exactly what that file exists for.
const ALLOWED = new Map([
  [0x2192, "rightwards arrow, in prose (genesis -> head)"],
  [0x21d2, "rightwards double arrow, in /docs prose"],
  [0x2265, "greater-than-or-equal, in /docs prose"],
]);

const unexpected = [...found.keys()].filter((cp) => !ALLOWED.has(cp));
if (found.size === 0) {
  console.log("Every rendered character is inside the vendored subset.");
  process.exit(0);
}

console.log(`${String(found.size)} distinct character(s) fall outside the vendored subset:\n`);
const rows = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [cp, e] of rows) {
  console.log(
    `  U+${cp.toString(16).toUpperCase().padStart(4, "0")}  ${e.ch}  x${String(e.count).padEnd(4)} ${[...e.routes].join(" ")}`,
  );
}
console.log("");
for (const [cp, e] of rows) {
  if (!ALLOWED.has(cp)) {
    console.log(
      `  UNEXPECTED U+${cp.toString(16).toUpperCase().padStart(4, "0")} ${e.ch} — if it is decorative, render it as inline SVG (components/Marks.tsx)`,
    );
  }
}
if (unexpected.length > 0) {
  console.log("");
  console.log("A character outside the subset renders in a SYSTEM font, so it depends on");
  console.log("the visitor having a font that covers it. Either allowlist it above with a");
  console.log("reason, or render it as inline SVG.");
  process.exit(1);
}
console.log("All allowlisted text punctuation — no DECORATIVE glyph depends on the");
console.log("visitor's font coverage.");
