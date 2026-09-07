/* global document, getComputedStyle */
// Does the LIVE page render in the vendored faces, or silently in a fallback?
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";
const url = process.env.FC_URL ?? "https://dogwatch-two.vercel.app/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const fontReqs = [];
page.on("response", (r) => { if (r.url().includes("/fonts/")) fontReqs.push(`${r.status()} ${r.url().split("/").pop()}`); });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const out = await page.evaluate(() => {
  const h1 = document.querySelector("h1");
  const mono = document.querySelector(".font-mono");
  const loaded = [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  return {
    h1Family: h1 ? getComputedStyle(h1).fontFamily : null,
    h1Size: h1 ? getComputedStyle(h1).fontSize : null,
    monoFamily: mono ? getComputedStyle(mono).fontFamily : null,
    loadedFaces: [...new Set(loaded)],
  };
});
console.log("font requests:", fontReqs.join(" | ") || "none");
console.log(JSON.stringify(out, null, 1));
await browser.close();
