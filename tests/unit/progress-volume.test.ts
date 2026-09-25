import { describe, expect, it } from "vitest"
import { bucketByWeek, fillWeekGaps, windowStart } from "@/features/progress/lib/volume"

describe("progress volume", () => {
  it("computes a window start N weeks back", () => {
    expect(windowStart("2026-01-26", 4, 1)).toBe("2026-01-05") // 3 weeks before this week's Monday
  })
  it("buckets sessions by week start with volume and count", () => {
    const out = bucketByWeek(
      [
        { completedDate: "2026-01-05", volumeKg: 100 },
        { completedDate: "2026-01-07", volumeKg: 50 },
        { completedDate: "2026-01-12", volumeKg: 200 },
      ],
      1,
    )
    expect(out).toEqual([
      { weekStart: "2026-01-05", volumeKg: 150, sessions: 2 },
      { weekStart: "2026-01-12", volumeKg: 200, sessions: 1 },
    ])
  })
  it("fills zero-volume week gaps across the window", () => {
    const out = fillWeekGaps(bucketByWeek([{ completedDate: "2026-01-12", volumeKg: 200 }], 1), "2025-12-29", "2026-01-19", 1)
    expect(out.map((b) => b.weekStart)).toEqual(["2025-12-29", "2026-01-05", "2026-01-12", "2026-01-19"])
    expect(out[0]).toEqual({ weekStart: "2025-12-29", volumeKg: 0, sessions: 0 })
    expect(out[2]?.volumeKg).toBe(200)
  })
})
