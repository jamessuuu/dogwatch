/* global document */
// Screenshot + PNG-width harness for the design pass. `document` above is
// declared for eslint because the `page.evaluate` callbacks below execute
// in the BROWSER, not in node — without it the flat config's node globals
// make every DOM reference a no-undef error.
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";
import { mkdirSync, statSync, readFileSync } from "node:fs";

const base = process.env.SHOT_BASE ?? "http://127.0.0.1:4177";
const tag = process.env.SHOT_TAG ?? "before";
const outDir = process.env.SHOT_DIR ?? "docs/shots";
mkdirSync(outDir, { recursive: true });

// Page list lives here, not in an env var: Git Bash's MSYS path conversion
// mangles any env value that looks like a POSIX path (it rewrote "/" into
// "C:/Program Files/Git/").
const RUN_ID = "01a077c2-cc0e-7f59-8d92-59f00faaa640";
const pages = [
  { path: "/", name: "home" },
  { path: `/runs/${RUN_ID}`, name: "run" },
  { path: "/methodology", name: "methodology" },
  { path: "/runs", name: "runs" },
  { path: "/checks", name: "checks" },
];

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

// PNG IHDR: width is a big-endian uint32 at byte offset 16, height at 20.
function readPngSize(path) {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const browser = await chromium.launch();
for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const p of pages) {
    const url = base + p.path;
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(700);
    const file = `${outDir}/${tag}-${p.name}-${vp.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    // The REAL pixel width of the written PNG, not the in-viewport
    // scrollWidth: an ambient gradient once bled a page to 437px at a
    // 390px viewport while scrollWidth read a clean 390.
    const png = readPngSize(file);
    const overflow = png.width > vp.width ? "  <<< PNG WIDER THAN VIEWPORT" : "";
    console.log(
      `${file}  status=${res?.status()}  pngW=${png.width} pngH=${png.height}  scrollW=${metrics.scrollWidth} clientW=${metrics.clientWidth}  bytes=${statSync(file).size}${overflow}`,
    );
  }
  await ctx.close();
}
await browser.close();
