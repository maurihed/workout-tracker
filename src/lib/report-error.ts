import "server-only"

import { logger } from "@/lib/logger"

type ReportContext = Record<string, unknown>

/**
 * Reports an unexpected server-side error to structured logs and, when
 * configured, Sentry. Both sinks are safe no-ops when their backend is
 * unconfigured: pino always writes to stdout, and Sentry is only contacted
 * when `SENTRY_DSN` is set (the SDK is lazy-loaded to keep it out of the
 * module graph when unused).
 */
export function reportError(error: unknown, context: ReportContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error))

  logger.error({ ...context, err }, "unhandled_error")

  if (!process.env.SENTRY_DSN) return

  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(err, { extra: context })
    })
    .catch(() => undefined)
}
