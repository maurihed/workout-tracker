import * as Sentry from "@sentry/nextjs"

/**
 * Client-side Sentry initialization. `SENTRY_DSN` is server-only, so client
 * error tracking requires `NEXT_PUBLIC_SENTRY_DSN`; without it this file is a
 * no-op and the SDK makes no network calls.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({ dsn })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
