import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/stats.service", () => ({ getAchievements: vi.fn(async () => ({ achievements: [], unlocked: [] })) }))
import { GET } from "@/app/api/achievements/route"

describe("GET /api/achievements", () => {
  it("returns the catalog envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { achievements: [], unlocked: [] } })
  })
})
