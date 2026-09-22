import { afterEach, describe, expect, it, vi } from "vitest"

import { requireOAuthEnv } from "@/lib/env"

describe("requireOAuthEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("returns the resolved values when all keys are present", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("GOOGLE_CLIENT_ID", "id")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret")

    expect(
      requireOAuthEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    ).toEqual({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })
  })

  it("warns instead of throwing in development", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PHASE", "")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    expect(() =>
      requireOAuthEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    ).not.toThrow()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Missing OAuth credentials: GOOGLE_CLIENT_ID"),
    )
  })

  it("throws naming only the missing keys in production runtime", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PHASE", "")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret")

    expect(() =>
      requireOAuthEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
    ).toThrowError("Missing OAuth credentials: GOOGLE_CLIENT_ID")
  })

  it("does not throw during tests", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")

    expect(() => requireOAuthEnv(["GOOGLE_CLIENT_ID"])).not.toThrow()
  })

  it("does not throw during a production build", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")
    vi.stubEnv("GOOGLE_CLIENT_ID", "")

    expect(() => requireOAuthEnv(["GOOGLE_CLIENT_ID"])).not.toThrow()
  })
})
