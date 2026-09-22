import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))

import { logger } from "@/lib/logger"
import { reportError } from "@/lib/report-error"

describe("reportError", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("logs the error and skips Sentry when no DSN is configured", async () => {
    vi.stubEnv("SENTRY_DSN", "")
    const logged = vi
      .spyOn(logger, "error")
      .mockImplementation(() => logger as never)
    const Sentry = await import("@sentry/nextjs")

    reportError(new Error("boom"), { route: "/api/test" })

    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ route: "/api/test", err: expect.any(Error) }),
      "unhandled_error",
    )
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it("forwards to Sentry when a DSN is configured", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc@o0.ingest.sentry.io/1")
    vi.spyOn(logger, "error").mockImplementation(() => logger as never)
    const Sentry = await import("@sentry/nextjs")

    reportError(new Error("boom"), { route: "/api/test" })

    await vi.waitFor(() =>
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        { extra: { route: "/api/test" } },
      ),
    )
  })
})
