// no browser globals needed: every DOM read here goes through Playwright locators
// Does the DEPLOYED page actually WORK, not just render?
// A prerendered Next.js page looks perfect while hydration is dead, so this
// registers pageerror/console-error listeners and CLICKS the centrepiece
// interaction rather than screenshotting it.
import { chromium } from "file:///C:/Users/admin/agentjames/node_modules/playwright/index.mjs";
const base = process.env.LC_URL ?? "https://dogwatch-two.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));

// 1. Home renders the aggregated history.
await page.goto(base, { waitUntil: "networkidle" });
const h1 = (await page.locator("h1").innerText()).replace(/\s+/g, " ");
console.log("h1:", h1);

// 2. The dead-man banner must NOT be firing (it was, for nine days).
const bodyText = await page.locator("body").innerText();
console.log("dead-man firing:", bodyText.includes("may have stopped") ? "YES — STILL BROKEN" : "no");

// 3. The centrepiece interaction, actually clicked on the deployed build.
const runLink = page.locator('a[href*="/runs/01a077c2"]').first();
await runLink.waitFor({ state: "visible", timeout: 15000 });
await runLink.click();
await page.waitForLoadState("networkidle");
const verify = page.getByRole("button", { name: /Verify this record/i });
await verify.waitFor({ state: "visible", timeout: 15000 });
await verify.click();
const result = page.locator('[data-testid="verify-result"]');
await result.waitFor({ state: "visible", timeout: 15000 });
const state = await page.locator("[data-verify-state]").getAttribute("data-verify-state");
console.log("verify button state:", state);
console.log("verify says:", (await result.innerText()).replace(/\s+/g, " ").slice(0, 160));

console.log("\nerrors:", errors.length === 0 ? "none" : errors.slice(0, 5).join("\n  "));
await browser.close();
process.exit(state === "ok" && errors.length === 0 ? 0 : 1);
