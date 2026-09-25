import { describe, expect, it } from "vitest"
import {
  HISTORY_SUMMARY_MAX_EXERCISES,
  buildHistoryIndex,
  buildHistorySummary,
  type HistorySession,
} from "@/features/ai/lib/history"

function session(completedAt: string, exercises: HistorySession["exercises"]): HistorySession {
  return { completedAt, exercises }
}

describe("buildHistoryIndex", () => {
  it("anchors on the heaviest working set across the last three sessions", () => {
    const index = buildHistoryIndex([
      session("2026-09-20T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 90, reps: 10 }, { weightKg: 100, reps: 5 }] },
      ]),
      session("2026-09-15T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 95, reps: 8 }] },
      ]),
      session("2026-09-10T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 92.5, reps: 8 }] },
      ]),
      session("2026-09-05T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 150, reps: 1 }] },
      ]),
    ])
    expect(index.hasData).toBe(true)
    expect(index.byExerciseId.get("ex1")).toEqual({
      identity: "id:ex1",
      name: "Barbell Squat",
      weightKg: 100,
      reps: 5,
      lastDate: "2026-09-20T10:00:00.000Z",
      sessions: 3,
    })
  })

  it("keys unidentified exercises by normalized name and ignores empty sets", () => {
    const index = buildHistoryIndex([
      session("2026-09-20T10:00:00.000Z", [
        { exerciseId: null, nameSnapshot: "  Goblet  Squat ", sets: [] },
        { exerciseId: null, nameSnapshot: "Goblet Squat", sets: [{ weightKg: 24, reps: 12 }] },
      ]),
    ])
    expect(index.hasData).toBe(true)
    expect(index.byName.get("goblet squat")?.weightKg).toBe(24)
    expect(index.byExerciseId.size).toBe(0)
  })

  it("returns an empty index when there is no usable data", () => {
    const index = buildHistoryIndex([])
    expect(index.hasData).toBe(false)
    expect(index.byName.size).toBe(0)
  })
})

describe("buildHistorySummary", () => {
  it("renders one capped, most-recent-first line per exercise", () => {
    const sessions: HistorySession[] = []
    for (let i = 0; i < HISTORY_SUMMARY_MAX_EXERCISES + 5; i += 1) {
      const date = new Date(Date.UTC(2026, 8, 28) - i * 86_400_000).toISOString()
      sessions.push(
        session(date, [
          { exerciseId: `ex${i}`, nameSnapshot: `Lift ${i}`, sets: [{ weightKg: 50, reps: 8 }] },
        ]),
      )
    }
    const summary = buildHistorySummary(buildHistoryIndex(sessions))
    const lines = summary.split("\n")
    expect(lines).toHaveLength(HISTORY_SUMMARY_MAX_EXERCISES)
    expect(lines[0]).toBe("- Lift 0: 50 kg × 8 (2026-09-28)")
  })

  it("returns an empty string with no data", () => {
    expect(buildHistorySummary(buildHistoryIndex([]))).toBe("")
  })
})
