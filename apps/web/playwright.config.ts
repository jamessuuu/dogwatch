import { defineConfig, devices } from "@playwright/test";

/**
 * SPEC §11.6: Playwright against `next build && next start`. The build
 * itself happens in `package.json`'s `e2e:smoke` script (`pnpm run build`)
 * before this config's `webServer` starts the already-built app — kept
 * separate so a build failure surfaces as a build failure, not a hung
 * webServer waiting on a port that never opens.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI !== undefined ? 1 : 0,
  reporter: process.env.CI !== undefined ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "next start -p 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: process.env.CI === undefined,
    timeout: 60_000,
  },
});
