import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/stats.service", () => ({ getStats: vi.fn(async () => ({ xp: 100, level: 2, currentStreak: 1, longestStreak: 1, lastHitDate: null, streakFreezes: 2, totalSessions: 1, totalVolumeKg: 10, xpToNextLevel: 300, levelProgress: 0, weeklyGoal: { target: 3, completed: 1, weekStart: "2026-01-05" } })) }))
import { GET } from "@/app/api/stats/route"

describe("GET /api/stats", () => {
  it("returns the stats envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.xp).toBe(100)
  })
})
