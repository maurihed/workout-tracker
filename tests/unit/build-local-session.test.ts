import { describe, expect, it } from "vitest"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1", name: "Push", nameEs: "Empuje", description: null, descriptionEs: null,
  goal: null, source: "manual", isActive: true,
  days: [{
    id: "d1", weekday: 1, label: "Push Day", order: 0,
    exercises: [{
      id: "re1", order: 0, exerciseId: "e1", customName: null,
      targetSets: 2, targetReps: "10", restSeconds: 60, targetWeightKg: 30,
      setTargets: null,
      timerType: "none", workSeconds: null, rounds: null, notes: null,
      exercise: { id: "e1", name: "Squat", nameEs: null, images: [] },
    }],
  }],
}

function seqIds() {
  let n = 0
  return () => `id-${++n}`
}

describe("buildLocalSession", () => {
  it("generates a session, exercise, and set ids", () => {
    const local = buildLocalSession(routine, routine.days[0]!, {
      newId: seqIds(), now: () => new Date("2026-01-01T10:00:00.000Z"),
    })
    expect(local.source.id).toBe("id-1")
    expect(local.source.name).toBe("Push Day")
    expect(local.source.status).toBe("in_progress")
    expect(local.source.startedAt).toBe("2026-01-01T10:00:00.000Z")
    expect(local.source.exercises[0]?.id).toBe("id-2")
    expect(local.source.exercises[0]?.sets.map((s) => s.id)).toEqual(["id-3", "id-4"])
    expect(local.source.exercises[0]?.sets[0]).toMatchObject({ setNumber: 1, reps: 10, weightKg: 30, completedAt: null })
  })

  it("falls back to the routine name when the day has no label", () => {
    const day = { ...routine.days[0]!, label: null }
    const local = buildLocalSession(routine, day, { newId: seqIds() })
    expect(local.source.name).toBe("Push")
  })

  it("builds an upsert payload carrying the snapshot and state", () => {
    const local = buildLocalSession(routine, routine.days[0]!, { newId: seqIds() })
    const payload = toUpsertPayload(local, 42)
    expect(payload.id).toBe(local.source.id)
    expect(payload.routineDayId).toBe("d1")
    expect(payload.activeSeconds).toBe(42)
    expect(payload.snapshot.routineDayId).toBe("d1")
    expect(payload.exercises[0]?.sets).toHaveLength(2)
  })

  it("carries per-set reps, weight and rpe into the built session", () => {
    const day = {
      ...routine.days[0]!,
      exercises: [{
        ...routine.days[0]!.exercises[0]!,
        targetSets: 2,
        setTargets: [
          { reps: 12, weightKg: 40, rpe: 7 },
          { reps: 10, weightKg: 45, rpe: 8 },
        ],
      }],
    }
    const local = buildLocalSession(routine, day, { newId: seqIds() })
    const sets = local.source.exercises[0]?.sets ?? []
    expect(sets).toHaveLength(2)
    expect(sets[0]).toMatchObject({ setNumber: 1, reps: 12, weightKg: 40, rpe: 7 })
    expect(sets[1]).toMatchObject({ setNumber: 2, reps: 10, weightKg: 45, rpe: 8 })
  })
})
