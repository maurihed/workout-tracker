import { describe, expect, it } from "vitest"

import { computeSummary, formatDuration } from "@/features/workouts/lib/summary"

const session = {
  activeSeconds: 1800,
  exercises: [
    {
      sets: [
        { reps: 10, weightKg: 40, completedAt: "x" },
        { reps: 8, weightKg: 50, completedAt: "y" },
        { reps: 5, weightKg: null, completedAt: null },
      ],
    },
    { sets: [{ reps: 12, weightKg: 20, completedAt: "z", type: "warmup" }] },
  ],
}

describe("computeSummary", () => {
  it("counts completed sets and sums volume over completed sets only", () => {
    const s = computeSummary(session as never)
    expect(s.durationSeconds).toBe(1800)
    expect(s.completedSets).toBe(3)
    expect(s.totalVolumeKg).toBe(10 * 40 + 8 * 50 + 12 * 20)
  })

  it("ignores completed sets missing reps or weight", () => {
    const s = computeSummary({
      activeSeconds: 60,
      exercises: [
        {
          sets: [
            { reps: null, weightKg: 50, completedAt: "x" },
            { reps: 10, weightKg: null, completedAt: "y" },
            { reps: 10, weightKg: 50, completedAt: null },
          ],
        },
      ],
    } as never)
    expect(s).toEqual({
      durationSeconds: 60,
      completedSets: 0,
      totalVolumeKg: 0,
    })
  })

  it("returns zeros for a session with no exercises", () => {
    expect(
      computeSummary({ activeSeconds: 0, exercises: [] } as never),
    ).toEqual({ durationSeconds: 0, completedSets: 0, totalVolumeKg: 0 })
  })
})

describe("formatDuration", () => {
  it("formats sub-hour durations as mm:ss", () => {
    expect(formatDuration(1800)).toBe("30:00")
    expect(formatDuration(65)).toBe("01:05")
  })

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01")
  })
})
