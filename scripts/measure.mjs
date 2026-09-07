/* global document, getComputedStyle */
// Numeric design profile of a rendered page — the acceptance floor, measured.
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";
const base = process.env.SHOT_BASE ?? "http://127.0.0.1:4177";
const width = Number(process.env.M_W ?? "1440");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(base + (process.env.M_PATH ?? "/"), { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const all = [...document.querySelectorAll("*")];
  let shadowed = 0, transitions = 0, animating = 0, radii = new Set(), blend = 0, backdrop = 0;
  let maxType = 0; const fams = {}; let sideBorder = 0;
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.boxShadow && cs.boxShadow !== "none") shadowed++;
    if (cs.transitionDuration && cs.transitionDuration !== "0s") transitions++;
    if (cs.animationName && cs.animationName !== "none") animating++;
    if (cs.borderRadius && cs.borderRadius !== "0px") radii.add(cs.borderRadius);
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") blend++;
    if (cs.backdropFilter && cs.backdropFilter !== "none") backdrop++;
    const fs = parseFloat(cs.fontSize);
    if (el.textContent && el.textContent.trim() && fs > maxType) maxType = fs;
    const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "");
    if (el.textContent && el.textContent.trim()) fams[fam] = (fams[fam] || 0) + 1;
    const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth);
    const bt = parseFloat(cs.borderTopWidth), bb = parseFloat(cs.borderBottomWidth);
    if (bl >= 3 && br === 0 && bt === 0 && bb === 0) sideBorder++;
  }
  const words = (document.body.innerText || "").trim().split(/\s+/).length;
  const emoji = (document.body.innerText || "").match(/\p{Extended_Pictographic}/gu);
  return { elements: all.length, shadowed, transitions, animating, radii: [...radii].slice(0, 6),
    blend, backdrop, maxType: Math.round(maxType), fams, words, sideBorder, emoji: emoji ? emoji.length : 0 };
});
console.log(JSON.stringify(m, null, 1));
await browser.close();
