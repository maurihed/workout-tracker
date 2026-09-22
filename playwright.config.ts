import dotenv from "dotenv"

import { defineConfig, devices } from "@playwright/test"

// Load `.env` silently: the session helper and webServer both need
// DATABASE_URL/AUTH_SECRET, but dotenv's default banner would dirty test output.
dotenv.config({ quiet: true })

// E2E specs live only in `tests/e2e`; without this scoping Playwright defaults
// `testDir` to the repo root and tries to load the Vitest unit/integration
// suites. `webServer` boots the production build against the Docker Postgres.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    // Mirrors the Docker image: build, stage `public`/`.next/static` into the
    // standalone output, then run the standalone server. `pnpm start` would
    // warn because next.config.ts uses `output: "standalone"`.
    command:
      "pnpm build && rm -rf .next/standalone/public .next/standalone/.next/static && cp -r public .next/standalone/ && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static && node .next/standalone/server.js",
    url: "http://127.0.0.1:3000/en",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: "3000",
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret",
      AUTH_URL: "http://127.0.0.1:3000",
      // The production server fails fast on missing OAuth credentials and the
      // shipped `.env` leaves the Facebook pair empty; sign-in is not exercised
      // by these specs, so placeholders are enough to boot.
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "e2e-google-id",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "e2e-google-secret",
      FACEBOOK_CLIENT_ID: process.env.FACEBOOK_CLIENT_ID || "e2e-facebook-id",
      FACEBOOK_CLIENT_SECRET:
        process.env.FACEBOOK_CLIENT_SECRET || "e2e-facebook-secret",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
})
