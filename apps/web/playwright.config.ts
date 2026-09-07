import { defineConfig, devices } from "@playwright/test";

/**
 * SPEC §11.6: Playwright against `next build && next start`. The build
 * itself happens in `package.json`'s `e2e:smoke` script (`pnpm run build`)
 * before this config's `webServer` starts the already-built app — kept
 * separate so a build failure surfaces as a build failure, not a hung
 * webServer waiting on a port that never opens.
 *
 * PORT + reuse (fixed 2026-09-07). This config previously pinned port 4173
 * and set `reuseExistingServer: process.env.CI === undefined`, so a local
 * run would silently attach to WHATEVER was already listening on 4173. Two
 * sibling projects in this portfolio hit exactly that failure on the same
 * day — one ran its entire e2e suite against a different project's website
 * and reported failures that had nothing to do with it. A suite that can
 * assert against the wrong site is worse than no suite, because it
 * manufactures both false passes and false failures.
 *
 * So: the port comes from `E2E_PORT` (default 4173 to keep the documented
 * command working), and reuse is OFF everywhere. Playwright then fails
 * loudly with "port already in use" instead of testing a stranger's site.
 */
const PORT = process.env.E2E_PORT ?? "4173";
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI !== undefined ? 1 : 0,
  reporter: process.env.CI !== undefined ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
