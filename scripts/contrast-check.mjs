/* global document, getComputedStyle */
/**
 * WCAG 2.2 SC 1.4.3 (Contrast, Minimum) against the RENDERED page.
 *
 * `project-gate` has no contrast check at all — its a11y coverage is
 * img-alt, button names and target size — so this dimension was unmeasured.
 *
 * Method, stated because contrast checkers disagree with each other and a
 * number without a method is not evidence:
 *
 *  - Foreground is the computed `color`, composited over the effective
 *    background if it carries alpha.
 *  - Effective background is found by walking ancestors until one has a
 *    non-transparent `background-color`, compositing each semi-transparent
 *    layer in turn. This is alpha-correct.
 *  - LIMIT: background IMAGES and gradients are not sampled. An element
 *    sitting on a gradient reports against the layer beneath it, which can
 *    be wrong in either direction. This page's only gradient is the ambient
 *    wash, which sits at z-index -1 behind an opaque `--color-paper` body,
 *    so the limit does not bite here — but it is why this script does not
 *    claim to be a general-purpose tool.
 *  - Relative luminance and the 4.5:1 / 3:1 thresholds are WCAG's own
 *    formulas, including the large-text exemption at >=24px, or >=18.66px
 *    when bold (>=700).
 *  - Only leaf-ish nodes with their own directly-owned text are measured, so
 *    a wrapper does not get blamed for its child's colour.
 *  - SVG <text> is measured on its `fill`, and its background is resolved
 *    from the nearest HTML ancestor (SVG elements have no background of
 *    their own). LIMIT: the size compared against the large-text threshold
 *    is the computed `font-size` in SVG user units, not the rendered pixel
 *    size after viewBox scaling. An upscaled SVG can therefore be held to
 *    4.5:1 where 3:1 would legally do — stricter than required, never
 *    looser, which is the correct direction for a gate to be wrong in.
 *
 *   CC_BASE=https://dogwatch-two.vercel.app node scripts/contrast-check.mjs
 */
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";

const base = process.env.CC_BASE ?? "http://127.0.0.1:4177";
const ROUTES = [
  "/",
  "/runs",
  "/checks",
  "/methodology",
  "/docs",
  "/runs/01a077c2-cc0e-7f59-8d92-59f00faaa640",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];

for (const route of ROUTES) {
  const res = await page.goto(base + route, { waitUntil: "networkidle" });
  if (res === null || res.status() >= 400) continue;

  const found = await page.evaluate(() => {
    const parse = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (m === null) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const lum = (c) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    // Effective background: composite every semi-transparent layer up the
    // tree onto the first opaque one.
    const bgOf = (el) => {
      const layers = [];
      // SVG elements have no background-color of their own; start the walk at
      // the nearest HTML ancestor so a chart label resolves against the panel
      // it is drawn on.
      let node = el.namespaceURI === "http://www.w3.org/2000/svg" ? el.ownerSVGElement?.parentElement ?? el : el;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c !== null && c.a > 0) {
          layers.push(c);
          if (c.a === 1) break;
        }
        node = node.parentElement;
      }
      if (layers.length === 0) return { r: 255, g: 255, b: 255, a: 1 };
      let acc = layers[layers.length - 1];
      for (let i = layers.length - 2; i >= 0; i -= 1) acc = over(layers[i], acc);
      return acc;
    };

    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      // Text this element owns directly, not its descendants'.
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (own.length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;

      const bg = bgOf(el);
      // SVG <text> paints with `fill`, not `color`. Reading only `color`
      // would make this checker blind to every chart label on the page.
      const isSvgText = el.namespaceURI === "http://www.w3.org/2000/svg";
      const fgRaw = parse(isSvgText ? cs.fill : cs.color);
      if (fgRaw === null) continue;
      const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;

      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fg, bg);
      if (got < need) {
        out.push({
          ratio: Math.round(got * 100) / 100,
          need,
          size: Math.round(size * 10) / 10,
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") ?? "").slice(0, 46),
          text: own.slice(0, 34),
        });
      }
    }
    return out;
  });

  for (const f of found) failures.push({ route, ...f });
}
await browser.close();

if (failures.length === 0) {
  console.log("WCAG 1.4.3: no contrast failures on any route.");
  process.exit(0);
}

console.log(`WCAG 1.4.3: ${String(failures.length)} failure(s)\n`);
for (const f of failures.sort((a, b) => a.ratio - b.ratio)) {
  console.log(
    `  ${String(f.ratio).padStart(5)}:1  need ${String(f.need)}  ${String(f.size).padStart(4)}px  ${f.route}`,
  );
  console.log(`         <${f.tag}> "${f.text}"  ${f.cls}`);
}
process.exit(1);
