/**
 * Next.js instrumentation hook. Sentry is only initialized when a DSN is
 * configured; with no `SENTRY_DSN` this is a no-op and the config modules are
 * never imported, so the SDK is not loaded at runtime.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config")
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config")
  }
}
