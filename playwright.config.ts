import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the critical user journeys. Run with `npm run test:e2e`.
 *
 * The browser binary is downloaded with `npx playwright install chromium`.
 * Locally we reuse a running `npm run dev`; in CI we build and start the
 * production server for a realistic run.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
