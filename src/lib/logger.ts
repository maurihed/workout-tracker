import "server-only"

import pino from "pino"

/**
 * Structured JSON logger. Redacts credentials from common auth/business
 * payload shapes so secrets never reach the log sink. The `*.password` and
 * `*.token` wildcards cover one nesting level (e.g. `user.password`).
 */
export const logger = pino({
  // Silence logs under Vitest so test output stays pristine.
  level: process.env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: ["req.headers.authorization", "*.password", "*.token"],
    censor: "[redacted]",
  },
})
