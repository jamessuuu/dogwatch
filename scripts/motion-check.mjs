/**
 * Does motion actually stop under `prefers-reduced-motion: reduce`?
 *
 * Checked by RENDERING, never by reading the stylesheet. Tailwind's
 * `transition-*` utilities emit a transition-property/duration pair
 * unconditionally — they are not wrapped in the media query — so a global
 * reduced-motion block in globals.css does not reach them unless it is
 * written to override the utility. Reading the CSS would show a correct
 * reduced-motion block and miss it entirely.
 *
 * Perceptibility floor: 20ms. The standard idiom for killing motion is
 * `0.001s !important` rather than `none`, so any JS awaiting `transitionend`
 * or `animationend` still receives its event instead of hanging. Those are
 * not motion and are not counted.
 *
 *   MC_URL=https://dogwatch-two.vercel.app node scripts/motion-check.mjs
 */
/* global document, getComputedStyle */
// Declared for eslint: the `page.evaluate` callback below executes in the
// BROWSER, not in node.
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";

const url = process.env.MC_URL ?? "http://127.0.0.1:4177";
const FLOOR_S = 0.02;

const browser = await chromium.launch();

async function profile(reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const out = await page.evaluate((floor) => {
    const longest = (v) =>
      Math.max(...String(v).split(",").map((s) => {
        const t = s.trim();
        const n = parseFloat(t);
        if (Number.isNaN(n)) return 0;
        return t.endsWith("ms") ? n / 1000 : n;
      }));
    const survivors = [];
    let transitions = 0;
    let animating = 0;
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const td = longest(cs.transitionDuration);
      const ad = cs.animationName !== "none" ? longest(cs.animationDuration) : 0;
      if (td >= floor) transitions += 1;
      if (ad >= floor) animating += 1;
      if (td >= floor || ad >= floor) {
        survivors.push(
          `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").slice(0, 44)} [t=${String(td)}s a=${String(ad)}s]`,
        );
      }
    }
    return { transitions, animating, survivors: survivors.slice(0, 12) };
  }, FLOOR_S);
  await ctx.close();
  return out;
}

const normal = await profile(false);
const reduce = await profile(true);
await browser.close();

console.log(`url    : ${url}`);
console.log(`normal : ${String(normal.transitions)} transitions, ${String(normal.animating)} animating`);
console.log(`reduce : ${String(reduce.transitions)} transitions, ${String(reduce.animating)} animating`);
if (reduce.transitions + reduce.animating > 0) {
  console.log(`\nMOTION SURVIVES reduced-motion (floor ${String(FLOOR_S)}s):`);
  for (const s of reduce.survivors) console.log(`  ${s}`);
  process.exit(1);
}
console.log("\nAll motion stops under prefers-reduced-motion.");
