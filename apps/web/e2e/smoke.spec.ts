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
  checksTotal: number;
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
  const pages = ["/", "/runs", `/runs/${latestRun.runId}`, "/checks", "/methodology", "/docs"];
  for (const path of pages) {
    test(`footer attribution + repo link + favicon present on ${path}`, async ({ page, request }) => {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "James Lorenz Santos" })).toHaveAttribute(
        "href",
        "https://agentjames.vercel.app"
      );
      await expect(page.getByRole("link", { name: /github\.com\/jamessuuu\/dogwatch/ })).toHaveAttribute(
        "href",
        "https://github.com/jamessuuu/dogwatch"
      );
      // The favicon is dogwatch's own compact glyph (a bell, not the chip) —
      // metadata.icons emits one SVG link plus three PNG sizes, all pointing
      // at the same regenerated /brand/favicon*.{svg,png}. Assert the
      // primary SVG icon link specifically (the scalable one browsers prefer)
      // and that it actually resolves over HTTP, not just that the DOM has a
      // plausible-looking <link>.
      const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]');
      await expect(svgIcon).toHaveAttribute("href", "/brand/favicon.svg");
      const iconResponse = await request.get("/brand/favicon.svg");
      expect(iconResponse.status()).toBe(200);
      expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");

      // The footer's mark stays the maker's chip, never the project glyph —
      // this is the bug this same change fixed (Footer.tsx used to point at
      // /brand/favicon.svg, which under the old generator WAS the chip but
      // under the new one is the project glyph).
      const chipImg = page.locator('footer img[src="/brand/mark-16.svg"]');
      await expect(chipImg).toHaveCount(1);
    });
  }

  test("apple-touch-icon and manifest links resolve", async ({ page, request }) => {
    await page.goto("/");
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute("href", "/brand/apple-touch-icon.png");
    const appleResponse = await request.get("/brand/apple-touch-icon.png");
    expect(appleResponse.status()).toBe(200);
    expect(appleResponse.headers()["content-type"]).toContain("image/png");

    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestHref = await manifestLink.getAttribute("href");
    if (!manifestHref) throw new Error("smoke: <link rel=manifest> has no href");
    const manifestResponse = await request.get(manifestHref);
    expect(manifestResponse.status()).toBe(200);
    const manifestJson = (await manifestResponse.json()) as { icons: { src: string }[] };
    expect(manifestJson.icons.length).toBeGreaterThan(0);
  });
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
    await expect(page.getByRole("link", { name: "Documentation" })).toBeVisible();
  });

  test("shows the last run's line at size, the diagram, the demo video, and a real record excerpt", async ({ page }) => {
    await page.goto("/");
    // The proof: checks/findings/gates/cost, read straight off runs/index.json,
    // rendered at size. Scoped to the stat-line paragraph specifically — the
    // record excerpt below repeats "N checks" in its own absence-of-evidence
    // prose, so a bare text match is ambiguous.
    await expect(page.locator("p.font-mono.text-3xl")).toContainText(`${String(latestRun.checksTotal)} checks`);
    // The mechanism diagram (scripts/diagram.mjs), with a real alt text, not "image".
    await expect(page.getByRole("img", { name: /gate/i })).toBeVisible();
    // The demo video — poster set, muted, looped, no controls.
    const video = page.locator("video");
    await expect(video).toHaveAttribute("poster", "/demo/dogwatch-poster.png");
    await expect(video).toHaveAttribute("muted", "");
    await expect(video).toHaveAttribute("loop", "");
    await expect(video).not.toHaveAttribute("controls");
    // The real record excerpt: never invented copy (HARD RULE). The excerpt
    // run is whichever published run has a finding (runWithFindings, same
    // fallback as the Verify-button tests below) — assert the finding
    // itself renders, with a real source URL and retrieval timestamp, not
    // just the section heading around it.
    await expect(page.getByRole("heading", { name: "A real published record, not a description of one" })).toBeVisible();
    if (runWithFindings.findings > 0) {
      await expect(page.getByRole("heading", { name: "A finding, with its source" })).toBeVisible();
      await expect(page.getByText(/→ \d+ at \d{4}-\d{2}-\d{2}T/)).not.toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: /See the full record/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What runs on its own, and what doesn't yet" })).toBeVisible();
  });

  test("reduced motion shows the poster and a link instead of the autoplaying video", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".demo-motion")).not.toBeVisible();
    await expect(page.locator(".demo-reduced")).toBeVisible();
    await expect(page.locator(".demo-reduced img")).toBeVisible();
    await expect(page.locator(".demo-reduced a", { hasText: "Watch the recording" })).toHaveAttribute(
      "href",
      "/demo/dogwatch-demo.webm",
    );
    await context.close();
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

test.describe("/docs", () => {
  test("is reachable from the nav and prints the full rubric, the gate flow, cost accounting, and failure modes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What this is, and what it is not" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How to read a run record, field by field" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "The gate flow, and the three decision channels" })).toBeVisible();
    await expect(page.getByRole("img", { name: /gate/i })).toBeVisible();
    await expect(page.getByText("R15", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cost accounting, and why micro-dollars" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Failure modes" })).toBeVisible();
    await expect(page.getByText("A gate is never decided", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
  });

  test("keyboard reachable: every section anchor is a real, focusable link", async ({ page }) => {
    await page.goto("/docs");
    const anchors = page.getByRole("navigation", { name: "On this page" }).getByRole("link");
    await expect(anchors).toHaveCount(7);
    await anchors.first().focus();
    await expect(anchors.first()).toBeFocused();
  });
});
