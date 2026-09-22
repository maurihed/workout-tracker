import { describe, expect, it, vi } from "vitest"

const store = new Map<string, { count: number; windowStart: Date }>()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        store.get(where.key) ?? null,
      upsert: async (args: {
        where: { key: string }
        create: { key: string; count: number; windowStart: Date }
        update: { count: number; windowStart: Date }
      }) => {
        const { where, create } = args
        store.set(where.key, {
          count: create.count,
          windowStart: create.windowStart,
        })
        return null
      },
    },
  },
}))

import { consumeRateLimit } from "@/lib/rate-limit"

describe("consumeRateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const now = new Date("2026-01-01T00:00:00Z")
    const first = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(1)
    const second = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(second.remaining).toBe(0)
    const third = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(third.allowed).toBe(false)
  })

  it("resets after the window elapses", async () => {
    const start = new Date("2026-01-02T00:00:00Z")
    await consumeRateLimit({ key: "k2", limit: 1, windowMs: 1000, now: start })
    const later = new Date(start.getTime() + 5000)
    const result = await consumeRateLimit({ key: "k2", limit: 1, windowMs: 1000, now: later })
    expect(result.allowed).toBe(true)
  })
})
