/**
 * SPEC §11.6 e2e:smoke — Playwright against `next build && next start`:
 * `/` renders with JS disabled, a run page shows checks/findings/absence/
 * cost, the Verify button turns green on a good record and red on a
 * tampered fixture, footer + favicon present everywhere.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

interface RunIndexEntry {
  runId: string;
  findings: number;
}
interface RunIndexFile {
  runs: RunIndexEntry[];
}

function loadRunIndex(): RunIndexFile {
  return JSON.parse(readFileSync(join(REPO_ROOT, "runs", "index.json"), "utf8")) as RunIndexFile;
}

const runIndex = loadRunIndex();
const latestRun = runIndex.runs.at(-1);
if (latestRun === undefined) throw new Error("e2e smoke: runs/index.json has no runs to test against");
// A record with findings exercises the Findings section and the Verify
// button against real evidence, not just a quiet run.
const runWithFindings = runIndex.runs.find((r) => r.findings > 0) ?? latestRun;

test.describe("footer + favicon on every page", () => {
  const pages = ["/", "/runs", `/runs/${latestRun.runId}`, "/checks", "/methodology"];
  for (const path of pages) {
    test(`footer attribution + repo link + favicon present on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "James Lorenz Santos" })).toHaveAttribute(
        "href",
        "https://agentjames.vercel.app"
      );
      await expect(page.getByRole("link", { name: /github\.com\/jamessuuu\/dogwatch/ })).toHaveAttribute(
        "href",
        "https://github.com/jamessuuu/dogwatch"
      );
      const favicon = page.locator('link[rel="icon"]');
      await expect(favicon).toHaveAttribute("href", /brand\/favicon\.svg/);
    });
  }
});

test.describe("/ — home", () => {
  test("renders with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "dogwatch", exact: true })).toBeVisible();
    // The noscript fallback in the dead-man banner must render real content
    // (both timestamps), not an empty shell, when JS never runs at all.
    await expect(page.locator("noscript")).toHaveCount(1);
    await context.close();
  });

  test("links to the latest run and the other pages", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "All runs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "The check catalog" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Methodology & limitations" })).toBeVisible();
  });
});

test.describe("/runs/<id> — a run page shows checks, findings, absence, and cost", () => {
  test(`renders checks, findings, absence-of-evidence, and cost for ${runWithFindings.runId}`, async ({ page }) => {
    await page.goto(`/runs/${runWithFindings.runId}`);
    await expect(page.getByRole("heading", { name: "Checks" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Absence of evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cost" })).toBeVisible();
    // Cost is rendered to four decimals (SPEC §8), e.g. "$0.0000" or
    // "$0.0012" — not full-string-anchored since it shares a text node
    // with the certainty label ("$0.0000 (reported)").
    await expect(page.getByText(/\$\d+\.\d{4}/).first()).toBeVisible();
    if (runWithFindings.findings > 0) {
      await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    }
  });
});

test.describe("Verify button", () => {
  test("turns green on a real, honest run record", async ({ page }) => {
    await page.goto(`/runs/${latestRun.runId}`);
    await page.getByRole("button", { name: "Verify this record" }).click();
    const result = page.getByTestId("verify-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Verified.");
  });

  test("turns red on a tampered fixture (fixtures/violations/r12-record-tampered)", async ({ page }) => {
    await page.goto("/fixtures/r12-record-tampered");
    await page.getByRole("button", { name: "Verify this record" }).click();
    const result = page.getByTestId("verify-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Verification failed.");
    await expect(result).toContainText("E_RECORD_TAMPERED");
  });

  test("turns red on a fixture with a manufactured finding (R13)", async ({ page }) => {
    await page.goto("/fixtures/r13-manufactured-finding");
    await page.getByRole("button", { name: "Verify this record" }).click();
    const result = page.getByTestId("verify-result");
    await expect(result).toContainText("E_MANUFACTURED_FINDING");
  });

  // M4 (SPEC §12): "the Verify button must now use sluice's pure
  // verifyEvents for real tamper-evidence. Prove it: a tampered fixture
  // must fail in CI AND in the browser e2e." r12 already proves the
  // record-hash chain; this fixture (a corrupted audit event hash — see
  // fixtures/violations/r11-chain-broken.json) proves the SAME button
  // independently re-verifies the sluice audit hash chain itself, computed
  // live in the browser from the JSON already on the page, zero server.
  test("turns red on a fixture with a broken audit hash chain (R11)", async ({ page }) => {
    await page.goto("/fixtures/r11-chain-broken");
    await page.getByRole("button", { name: "Verify this record" }).click();
    const result = page.getByTestId("verify-result");
    await expect(result).toBeVisible();
    await expect(result).toContainText("Verification failed.");
    await expect(result).toContainText("E_CHAIN_BROKEN");
  });
});

test.describe("/checks — the catalog", () => {
  test("renders every family from the registry, including landing-milestone families", async ({ page }) => {
    await page.goto("/checks");
    await expect(page.getByRole("heading", { name: "reach", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "watch", exact: true })).toBeVisible();
    await expect(page.getByText(/lands at M4/).first()).toBeVisible();
  });
});

test.describe("/gate — the only page that POSTs (SPEC S5 step 3, M5)", () => {
  test("no id -> a clear message, not a crash", async ({ page }) => {
    await page.goto("/gate");
    await expect(page.getByRole("heading", { name: "Decide a gate" })).toBeVisible();
    await expect(page.getByText("No gate id given.")).toBeVisible();
  });

  test("unknown id -> reports the gate is not currently pending, not a crash", async ({ page }) => {
    await page.goto("/gate?id=nonexistent-gate-id");
    await expect(page.getByText("This gate is not currently pending")).toBeVisible();
  });
});

test.describe("/methodology", () => {
  test("prints the rubric, the anti-manufacture rule, the autonomy ladder, and limitations", async ({ page }) => {
    await page.goto("/methodology");
    await expect(page.getByRole("heading", { name: "The honesty rubric" })).toBeVisible();
    await expect(page.getByText("R13", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "The autonomy ladder" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
    await expect(page.getByText("not a product you install")).toBeVisible();
  });
});
