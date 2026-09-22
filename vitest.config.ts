import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

// `server-only` throws when imported outside a React Server environment. Tests
// import server modules directly, so alias it to an empty stub in tests only.
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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
      "prisma/**/*.test.ts",
    ],
    // `next-auth` imports the extensionless `next/server`, which native Node
    // ESM cannot resolve. Inline it so Vite resolves it while transforming.
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Modest floors measured from the current suite; raise as Phase 2+ lands
      // more pure-domain tests. CI fails when coverage drops below these.
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 50,
        lines: 70,
      },
    },
  },
})
