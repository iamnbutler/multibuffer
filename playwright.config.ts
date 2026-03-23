import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for e2e tests.
 *
 * The webServer option builds and serves the playground before tests run.
 * Tests interact with the editor in a real browser environment.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "bun run serve:playground",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
