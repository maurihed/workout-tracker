import { describe, expect, it } from "vitest"
import { bestE1rm, seriesForExercise } from "@/features/progress/lib/one-rm"

describe("bestE1rm", () => {
  it("picks the best working-set e1rm", () => {
    expect(
      bestE1rm([
        { reps: 5, weightKg: 100, type: "working" },
        { reps: 10, weightKg: 50, type: "warmup" },
      ]),
    ).toBeCloseTo(100 * (1 + 5 / 30))
  })

  it("ignores warm-ups, null reps and null weight", () => {
    expect(bestE1rm([{ reps: 25, weightKg: 40, type: "warmup" }])).toBeNull()
    expect(bestE1rm([{ reps: null, weightKg: 100, type: "working" }])).toBeNull()
    expect(bestE1rm([{ reps: 5, weightKg: null, type: "working" }])).toBeNull()
    expect(bestE1rm([])).toBeNull()
  })
})

describe("seriesForExercise", () => {
  it("builds a per-session series", () => {
    const sessions = [
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [{ exerciseId: "e1", sets: [{ reps: 5, weightKg: 100, type: "working" }] }],
      },
      {
        id: "s2",
        date: "2026-01-12",
        exercises: [{ exerciseId: "e1", sets: [{ reps: 3, weightKg: 110, type: "working" }] }],
      },
    ]
    expect(seriesForExercise(sessions, "e1").map((p) => p.date)).toEqual([
      "2026-01-05",
      "2026-01-12",
    ])
  })

  it("uses the best e1rm set per session and sorts by date", () => {
    const sessions = [
      {
        id: "s2",
        date: "2026-01-12",
        exercises: [
          {
            exerciseId: "e1",
            sets: [
              { reps: 3, weightKg: 100, type: "working" },
              { reps: 1, weightKg: 110, type: "working" },
            ],
          },
        ],
      },
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [{ exerciseId: "e1", sets: [{ reps: 8, weightKg: 80, type: "working" }] }],
      },
    ]
    const points = seriesForExercise(sessions, "e1")
    expect(points.map((p) => p.date)).toEqual(["2026-01-05", "2026-01-12"])
    expect(points[0]).toEqual({
      date: "2026-01-05",
      e1rm: 80 * (1 + 8 / 30),
      topWeightKg: 80,
      reps: 8,
    })
    expect(points[1]).toEqual({
      date: "2026-01-12",
      e1rm: 110 * (1 + 1 / 30),
      topWeightKg: 110,
      reps: 1,
    })
  })

  it("skips sessions without the exercise or without a valid working set", () => {
    const sessions = [
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [{ exerciseId: "e2", sets: [{ reps: 5, weightKg: 100, type: "working" }] }],
      },
      {
        id: "s2",
        date: "2026-01-06",
        exercises: [{ exerciseId: "e1", sets: [{ reps: 12, weightKg: 30, type: "warmup" }] }],
      },
      {
        id: "s3",
        date: "2026-01-07",
        exercises: [{ exerciseId: null, sets: [{ reps: 5, weightKg: 100, type: "working" }] }],
      },
    ]
    expect(seriesForExercise(sessions, "e1")).toEqual([])
  })
})
