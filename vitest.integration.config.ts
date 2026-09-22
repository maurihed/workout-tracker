import "dotenv/config"

import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// Integration tests hit a real Postgres database (see docker-compose.yml), so
// they run in a Node environment with no DOM setup. `server-only` is aliased to
// an empty stub because tests import server modules directly.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["tests/integration/**/*.test.ts"],
    // `next-auth`/`next-intl` import the extensionless `next/server`, which
    // native Node ESM cannot resolve. Inline them so Vite resolves it while
    // transforming.
    server: { deps: { inline: ["next-auth", "@auth/core", "next-intl"] } },
  },
})
