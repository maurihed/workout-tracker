import { describe, expect, it } from "vitest"
import { createRoutineSchema, routineInputSchema } from "@/features/routines/schemas/routine"

const day = {
  weekday: 1,
  label: "Push",
  exercises: [
    { exerciseId: "e1", targetSets: 3, targetReps: "8-12", restSeconds: 90, targetWeightKg: null, timerType: "none", workSeconds: null, rounds: null, notes: null },
  ],
}

describe("createRoutineSchema", () => {
  it("accepts a name and rejects an empty one", () => {
    expect(createRoutineSchema.safeParse({ name: "My Routine" }).success).toBe(true)
    expect(createRoutineSchema.safeParse({ name: "" }).success).toBe(false)
  })
})

describe("routineInputSchema", () => {
  it("accepts a valid routine", () => {
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [day] }).success).toBe(true)
  })
  it("rejects duplicate weekdays", () => {
    const result = routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [day, { ...day, label: "Push 2" }] })
    expect(result.success).toBe(false)
  })
  it("requires a day and an exercise", () => {
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [] }).success).toBe(false)
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ weekday: 1, label: null, exercises: [] }] }).success).toBe(false)
  })
  it("requires workSeconds and rounds when a timer is set", () => {
    const timed = { ...day, exercises: [{ ...day.exercises[0], timerType: "emom", workSeconds: null, rounds: null }] }
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [timed] }).success).toBe(false)
  })
  it("rejects out-of-range sets", () => {
    const bad = { ...day, exercises: [{ ...day.exercises[0], targetSets: 0 }] }
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [bad] }).success).toBe(false)
  })
  it("accepts per-set targets that match the set count", () => {
    const ex = {
      ...day.exercises[0],
      targetSets: 2,
      setTargets: [
        { reps: 12, weightKg: 40, rpe: 7 },
        { reps: 10, weightKg: 45, rpe: 8 },
      ],
    }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(true)
  })

  it("rejects per-set targets whose length differs from targetSets", () => {
    const ex = { ...day.exercises[0], targetSets: 3, setTargets: [{ reps: 10, weightKg: null, rpe: null }] }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(false)
  })

  it("rejects an out-of-range RPE", () => {
    const ex = { ...day.exercises[0], targetSets: 1, setTargets: [{ reps: 10, weightKg: null, rpe: 11 }] }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(false)
  })
})
