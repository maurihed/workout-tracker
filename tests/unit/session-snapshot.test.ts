import { describe, expect, it } from "vitest"
import {
  buildSessionSnapshot, parseTargetReps, seedSets, type RoutineDay,
} from "@/features/workouts/lib/session-snapshot"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1", name: "Push", nameEs: "Empuje", description: null, descriptionEs: null,
  goal: null, source: "manual", isActive: true,
  days: [{
    id: "d1", weekday: 1, label: "Push", order: 0,
    exercises: [{
      id: "re1", order: 0, exerciseId: "e1", customName: null,
      targetSets: 3, targetReps: "8-12", restSeconds: 90, targetWeightKg: 40,
      setTargets: null,
      timerType: "none", workSeconds: null, rounds: null, notes: null,
      exercise: { id: "e1", name: "Squat", nameEs: "Sentadilla", images: [], instructions: [], isCustom: false },
    }],
  }],
}

describe("session snapshot", () => {
  it("parses only exact integer prescriptions", () => {
    expect(parseTargetReps("10")).toBe(10)
    expect(parseTargetReps(" 12 ")).toBe(12)
    expect(parseTargetReps("8-12")).toBeNull()
    expect(parseTargetReps("AMRAP")).toBeNull()
    expect(parseTargetReps(null)).toBeNull()
  })

  it("freezes routine/day identity and per-exercise prescriptions", () => {
    const snap = buildSessionSnapshot(routine, routine.days[0]! as RoutineDay)
    expect(snap).toMatchObject({ routineId: "r1", routineDayId: "d1", name: "Push", nameEs: "Empuje", weekday: 1, label: "Push" })
    expect(snap.exercises[0]).toEqual({
      order: 0, name: "Squat", nameEs: "Sentadilla", targetSets: 3, targetReps: "8-12",
      restSeconds: 90, targetWeightKg: 40, setTargets: null, timerType: "none", workSeconds: null, rounds: null,
    })
  })

  it("prefers a custom name and falls back for unknown exercises", () => {
    const day = { ...routine.days[0]!, exercises: [{ ...routine.days[0]!.exercises[0]!, customName: "My Lift", exercise: null }] }
    const snap = buildSessionSnapshot(routine, day as RoutineDay)
    expect(snap.exercises[0]?.name).toBe("My Lift")
    expect(snap.exercises[0]?.nameEs).toBeNull()
  })

  it("seeds clamped, uncompleted prescribed sets", () => {
    const sets = seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 3, targetReps: "10" })
    expect(sets).toEqual([
      { setNumber: 1, type: "working", reps: 10, weightKg: 40, rpe: null },
      { setNumber: 2, type: "working", reps: 10, weightKg: 40, rpe: null },
      { setNumber: 3, type: "working", reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("seeds each set from its own per-set target", () => {
    const sets = seedSets({
      ...routine.days[0]!.exercises[0]!,
      targetSets: 2,
      setTargets: [
        { reps: 12, weightKg: 40, rpe: 7 },
        { reps: 8, weightKg: 50, rpe: 9 },
      ],
    })
    expect(sets).toEqual([
      { setNumber: 1, type: "working", reps: 12, weightKg: 40, rpe: 7 },
      { setNumber: 2, type: "working", reps: 8, weightKg: 50, rpe: 9 },
    ])
  })

  it("caps seeded sets and tolerates ranges/zero sets", () => {
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 999 }).length).toBe(50)
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 0 })).toEqual([])
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetReps: "8-12" })[0]?.reps).toBeNull()
  })
})
