import { describe, expect, it } from "vitest"
import { completeSessionSchema, sessionStateSchema, sessionUpsertSchema } from "@/features/workouts/schemas/session"

const SE = "11111111-1111-4111-8111-111111111111"
const SET = "22222222-2222-4222-8222-222222222222"
const set = { id: SET, setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() }
const ex = { id: SE, exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [set] }
const snapshot = { routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push", exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null }] }

describe("session schemas", () => {
  it("requires UUIDs for exercise and set ids", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [ex] }).success).toBe(true)
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [{ ...ex, id: "se1" }] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [{ ...ex, sets: [{ ...set, id: "s1" }] }] }).success).toBe(false)
  })

  it("accepts a valid session state and rejects a bad rpe/time", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: -1, exercises: [ex] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, rpe: 11 }] }] }).success).toBe(false)
  })

  it("defaults swap provenance to null and accepts an explicit origin", () => {
    const omitted = sessionStateSchema.parse({ activeSeconds: 0, exercises: [ex] })
    expect(omitted.exercises[0]?.swappedFromId).toBeNull()
    const swapped = sessionStateSchema.parse({ activeSeconds: 0, exercises: [{ ...ex, swappedFromId: "e0" }] })
    expect(swapped.exercises[0]?.swappedFromId).toBe("e0")
  })

  it("validates the upsert envelope and its snapshot", () => {
    const good = { id: "33333333-3333-4333-8333-333333333333", routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0, snapshot, exercises: [ex] }
    expect(sessionUpsertSchema.safeParse(good).success).toBe(true)
    expect(sessionUpsertSchema.safeParse({ ...good, id: "nope" }).success).toBe(false)
    expect(sessionUpsertSchema.safeParse({ ...good, snapshot: { ...snapshot, weekday: 9 } }).success).toBe(false)
    expect(sessionUpsertSchema.safeParse({ ...good, snapshot: { ...snapshot, exercises: [] } }).success).toBe(false)
  })

  it("preserves per-set targets in the session snapshot", () => {
    const setTargets = [
      { reps: 12, weightKg: 40, rpe: 7 },
      { reps: 8, weightKg: 50, rpe: 9 },
    ]
    const withTargets = {
      ...snapshot,
      exercises: [{ ...snapshot.exercises[0], setTargets }],
    }
    const good = { id: "33333333-3333-4333-8333-333333333333", routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0, snapshot: withTargets, exercises: [ex] }
    const result = sessionUpsertSchema.safeParse(good)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.snapshot.exercises[0]?.setTargets).toEqual(setTargets)
  })

  it("defaults a missing snapshot setTargets to null", () => {
    const good = { id: "33333333-3333-4333-8333-333333333333", routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0, snapshot, exercises: [ex] }
    const result = sessionUpsertSchema.safeParse(good)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.snapshot.exercises[0]?.setTargets).toBeNull()
  })

  it("rejects an over-long note and a non-integer weight", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, notes: "x".repeat(501) }] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, weightKg: -1 }] }] }).success).toBe(false)
  })

  it("complete requires non-negative activeSeconds", () => {
    expect(completeSessionSchema.safeParse({ activeSeconds: 0 }).success).toBe(true)
    expect(completeSessionSchema.safeParse({ activeSeconds: -5 }).success).toBe(false)
  })
})
