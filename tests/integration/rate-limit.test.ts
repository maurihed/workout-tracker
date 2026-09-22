import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"

// Keys are scoped to a dedicated `rate-limit-it:` prefix so cleanup never
// touches fixtures owned by sibling integration suites.
const PREFIX = "rate-limit-it:"
const uniqueKey = (name: string) => `${PREFIX}${name}:${Date.now()}-${Math.random()}`

describe("consumeRateLimit (postgres)", () => {
  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: PREFIX } } })
  })

  it("allows up to the limit then blocks within the window", async () => {
    const key = uniqueKey("allow")
    const now = new Date()

    const first = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, now })
    expect(first).toEqual({ allowed: true, remaining: 1 })

    const second = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, now })
    expect(second).toEqual({ allowed: true, remaining: 0 })

    const third = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, now })
    expect(third).toEqual({ allowed: false, remaining: 0 })
  })

  it("resets the count once the window elapses", async () => {
    const key = uniqueKey("reset")
    const start = new Date()

    await consumeRateLimit({ key, limit: 1, windowMs: 1000, now: start })
    const blocked = await consumeRateLimit({
      key,
      limit: 1,
      windowMs: 1000,
      now: new Date(start.getTime() + 500),
    })
    expect(blocked.allowed).toBe(false)

    const reset = await consumeRateLimit({
      key,
      limit: 1,
      windowMs: 1000,
      now: new Date(start.getTime() + 2000),
    })
    expect(reset.allowed).toBe(true)
    expect(reset.remaining).toBe(0)
  })
})
