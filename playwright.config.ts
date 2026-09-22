import { defineConfig, devices } from "@playwright/test"

// E2E specs live only in `tests/e2e`; without this scoping Playwright defaults
// `testDir` to the repo root and tries to load the Vitest unit/integration
// suites. `webServer` is intentionally left for Phase 2 when the first specs
// (login, onboarding) land.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
})
