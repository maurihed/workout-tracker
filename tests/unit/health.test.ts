import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ ok: 1 }]) },
}))

import { prisma } from "@/lib/prisma"
import { GET } from "@/app/api/health/route"

describe("GET /api/health", () => {
  it("returns ok with db true when the query succeeds", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { status: "ok", db: true },
    })
  })

  it("returns degraded with db false when the query fails", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("db down"))

    const res = await GET()
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      data: { status: "degraded", db: false },
    })
  })
})
