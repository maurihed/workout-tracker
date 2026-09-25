import { describe, expect, it } from "vitest"
import { buildHistoryIndex, type HistorySession } from "@/features/ai/lib/history"
import { PERSONALIZATION_VERSION, personalizeRoutine, roundToIncrement } from "@/features/ai/lib/personalize"
import type { AiRoutine } from "@/features/ai/lib/contract"

function routine(targetWeightKg: number | null, reps: string, exerciseId: string | null = "ex1"): AiRoutine {
  return {
    name: "Plan",
    goal: null,
    days: [
      {
        weekday: 1,
        label: null,
        exercises: [
          {
            sourceId: "Barbell_Squat",
            name: "Barbell Squat",
            sets: 3,
            reps,
            restSeconds: 90,
            targetWeightKg,
            timerType: "none",
            exerciseId,
            customName: null,
          },
        ],
      },
    ],
  }
}

function indexWith(weightKg: number, reps: number) {
  const sessions: HistorySession[] = [
    {
      completedAt: "2026-09-20T10:00:00.000Z",
      exercises: [{ exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg, reps }] }],
    },
  ]
  return buildHistoryIndex(sessions)
}

describe("roundToIncrement", () => {
  it("rounds to the nearest 2.5 kg", () => {
    expect(roundToIncrement(97.12)).toBe(97.5)
    expect(roundToIncrement(101)).toBe(100)
  })
})

describe("personalizeRoutine", () => {
  it("raises the load when the top of the range was hit", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 12))
    expect(result.applied).toBe(1)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(105)
  })

  it("holds when reps are inside the range", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 10))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(100)
  })

  it("deloads when below the range", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 5))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(95)
  })

  it("forces one increment when rounding collapses a raise", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(20, 12))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(22.5)
  })

  it("leaves an exercise with no history untouched", () => {
    const result = personalizeRoutine(routine(60, "8-12"), buildHistoryIndex([]))
    expect(result.applied).toBe(0)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(60)
  })

  it("leaves an unparseable rep range untouched", () => {
    const result = personalizeRoutine(routine(60, "AMRAP"), indexWith(100, 10))
    expect(result.applied).toBe(0)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(60)
  })

  it("matches a custom exercise by name", () => {
    const custom = routine(null, "8-12", null)
    if (custom.days[0]) {
      custom.days[0].exercises[0] = {
        ...custom.days[0].exercises[0]!,
        sourceId: null,
        name: null,
        customName: "Barbell Squat",
      }
    }
    const sessions: HistorySession[] = [
      {
        completedAt: "2026-09-20T10:00:00.000Z",
        exercises: [{ exerciseId: null, nameSnapshot: "barbell squat", sets: [{ weightKg: 80, reps: 12 }] }],
      },
    ]
    const result = personalizeRoutine(custom, buildHistoryIndex(sessions))
    expect(result.applied).toBe(1)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(85)
  })

  it("exposes a personalization version", () => {
    expect(PERSONALIZATION_VERSION).toBe("1")
  })
})
