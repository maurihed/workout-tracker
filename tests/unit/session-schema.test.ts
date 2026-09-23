import { describe, expect, it } from "vitest"
import { completeSessionSchema, sessionStateSchema, startSessionSchema } from "@/features/workouts/schemas/session"

const set = { setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() }
const ex = { id: "se1", exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [set] }

describe("session schemas", () => {
  it("start requires a non-empty routineDayId", () => {
    expect(startSessionSchema.safeParse({ routineDayId: "rd1" }).success).toBe(true)
    expect(startSessionSchema.safeParse({ routineDayId: "" }).success).toBe(false)
  })
  it("accepts a valid session state and rejects a bad rpe/time", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [ex] }).success).toBe(true)
    expect(sessionStateSchema.safeParse({ activeSeconds: -1, exercises: [ex] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, rpe: 11 }] }] }).success).toBe(false)
  })
  it("defaults swap provenance to null and accepts an explicit origin", () => {
    const omitted = sessionStateSchema.parse({ activeSeconds: 0, exercises: [ex] })
    expect(omitted.exercises[0]?.swappedFromId).toBeNull()
    const swapped = sessionStateSchema.parse({ activeSeconds: 0, exercises: [{ ...ex, swappedFromId: "e0" }] })
    expect(swapped.exercises[0]?.swappedFromId).toBe("e0")
  })
  it("complete requires non-negative activeSeconds", () => {
    expect(completeSessionSchema.safeParse({ activeSeconds: 0 }).success).toBe(true)
    expect(completeSessionSchema.safeParse({ activeSeconds: -5 }).success).toBe(false)
  })
})
