import * as Sentry from "@sentry/nextjs"

/**
 * Next.js instrumentation hook. Sentry is only initialized when a DSN is
 * configured; with no `SENTRY_DSN` the config modules are never imported and
 * `onRequestError` below is a no-op, so the SDK is not loaded at runtime.
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

/**
 * Reports request errors (server components, route handlers, middleware) to
 * Sentry. Guarded by the DSN so an unconfigured deployment does nothing.
 */
export const onRequestError: typeof Sentry.captureRequestError = (
  error,
  request,
  context,
) => {
  if (!process.env.SENTRY_DSN) return
  Sentry.captureRequestError(error, request, context)
}
