import { describe, expect, it } from "vitest"
import { recentPrs } from "@/features/progress/lib/pr"

describe("recentPrs", () => {
  it("returns isPr sets newest first, limited", () => {
    const sessions = [
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [
          { exerciseId: "e1", nameSnapshot: "Squat", sets: [{ isPr: true, weightKg: 100, reps: 5 }] },
        ],
      },
      {
        id: "s2",
        date: "2026-01-12",
        exercises: [
          { exerciseId: "e1", nameSnapshot: "Squat", sets: [{ isPr: true, weightKg: 110, reps: 3 }] },
        ],
      },
    ]
    const prs = recentPrs(sessions, 1)
    expect(prs).toHaveLength(1)
    expect(prs[0]).toMatchObject({ sessionId: "s2", weightKg: 110, reps: 3 })
  })

  it("ignores non-PR sets and PR sets with null weight or reps", () => {
    const sessions = [
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [
          {
            exerciseId: "e1",
            nameSnapshot: "Squat",
            sets: [
              { isPr: false, weightKg: 100, reps: 5 },
              { isPr: true, weightKg: null, reps: 5 },
              { isPr: true, weightKg: 100, reps: null },
            ],
          },
        ],
      },
    ]
    expect(recentPrs(sessions, 5)).toEqual([])
  })

  it("returns every PR under the limit with the snapshot name", () => {
    const sessions = [
      {
        id: "s1",
        date: "2026-01-05",
        exercises: [
          { exerciseId: "e1", nameSnapshot: "Squat", sets: [{ isPr: true, weightKg: 100, reps: 5 }] },
        ],
      },
      {
        id: "s2",
        date: "2026-01-12",
        exercises: [
          {
            exerciseId: "e2",
            nameSnapshot: "Bench",
            sets: [
              { isPr: true, weightKg: 60, reps: 8 },
              { isPr: false, weightKg: 70, reps: 1 },
            ],
          },
        ],
      },
    ]
    expect(recentPrs(sessions, 5)).toEqual([
      { sessionId: "s2", date: "2026-01-12", exerciseId: "e2", name: "Bench", weightKg: 60, reps: 8 },
      { sessionId: "s1", date: "2026-01-05", exerciseId: "e1", name: "Squat", weightKg: 100, reps: 5 },
    ])
  })
})
