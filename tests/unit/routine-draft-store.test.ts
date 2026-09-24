import { beforeEach, describe, expect, it } from "vitest"
import {
  OrphanedExerciseError,
  useRoutineDraftStore,
} from "@/features/routines/stores/routine-draft-store"

const routine = {
  id: "r1", name: "Plan", description: null, source: "manual" as const, isActive: false,
  days: [{ id: "d1", weekday: 1, label: "Push", order: 0, exercises: [] }],
}

describe("routine draft store", () => {
  beforeEach(() => useRoutineDraftStore.getState().clearDraft())

  it("hydrates, edits, and marks dirty; clearDraft resets", () => {
    const s = useRoutineDraftStore.getState()
    s.hydrate(routine)
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
    useRoutineDraftStore.getState().setHeader({ name: "Renamed" })
    expect(useRoutineDraftStore.getState().name).toBe("Renamed")
    expect(useRoutineDraftStore.getState().isDirty).toBe(true)
    useRoutineDraftStore.getState().clearDraft()
    expect(useRoutineDraftStore.getState().days).toHaveLength(0)
  })

  it("adds a day with a client id and appends exercises to it", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    useRoutineDraftStore.getState().addDay(2)
    const days = useRoutineDraftStore.getState().days
    const created = days.at(-1)!
    expect(created.id).toBeTruthy()
    useRoutineDraftStore.getState().addExercises(created.id, [{ exerciseId: "e1", name: "Squat" }])
    const updated = useRoutineDraftStore.getState().days.at(-1)!
    expect(updated.exercises).toHaveLength(1)
    expect(updated.exercises[0]?.name).toBe("Squat")
  })

  it("survives a rehydrate for the same routine but resets for a different one", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    useRoutineDraftStore.getState().addDay(3)
    useRoutineDraftStore.getState().hydrate(routine) // same id → keep draft
    expect(useRoutineDraftStore.getState().days).toHaveLength(2)
    useRoutineDraftStore.getState().hydrate({ ...routine, id: "r2", name: "Other" })
    expect(useRoutineDraftStore.getState().name).toBe("Other")
    expect(useRoutineDraftStore.getState().days).toHaveLength(1)
  })

  it("only marks dirty when a reorder actually changes the order", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    useRoutineDraftStore.getState().moveDay(0, 0)
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
    useRoutineDraftStore.getState().moveDay(0, 9)
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
  })

  it("ignores addExercises for an unknown day without dirtying the draft", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    const added = useRoutineDraftStore
      .getState()
      .addExercises("missing-day", [{ exerciseId: "e1", name: "Squat" }])
    expect(added).toBe(false)
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
    expect(useRoutineDraftStore.getState().days).toHaveLength(1)
    expect(useRoutineDraftStore.getState().days[0]?.exercises).toHaveLength(0)
  })

  it("throws a specific error for an exercise without a catalog reference", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        {
          id: "d1",
          weekday: 1,
          label: null,
          exercises: [
            {
              id: "x1",
              exerciseId: null,
              customName: "Legacy custom",
              targetSets: 3,
              targetReps: "10",
              restSeconds: 60,
              targetWeightKg: null,
              timerType: "none",
              workSeconds: null,
              rounds: null,
              notes: null,
            },
          ],
        },
      ],
    })
    expect(() => useRoutineDraftStore.getState().toRoutineInput()).toThrow(
      OrphanedExerciseError,
    )
  })

  it("synthesizes per-set targets from the legacy prescription on hydrate", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        {
          id: "d1",
          weekday: 1,
          label: "Push",
          exercises: [
            {
              id: "x1",
              exerciseId: "c1",
              customName: null,
              targetSets: 3,
              targetReps: "10",
              restSeconds: 60,
              targetWeightKg: 40,
              timerType: "none",
              workSeconds: null,
              rounds: null,
              notes: null,
            },
          ],
        },
      ],
    })
    const ex = useRoutineDraftStore.getState().days[0]!.exercises[0]!
    expect(ex.setTargets).toEqual([
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("emits setTargets in toRoutineInput", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        {
          id: "d1",
          weekday: 1,
          label: "Push",
          exercises: [
            {
              id: "x1",
              exerciseId: "c1",
              customName: null,
              targetSets: 2,
              targetReps: "10",
              restSeconds: 60,
              targetWeightKg: null,
              timerType: "none",
              workSeconds: null,
              rounds: null,
              notes: null,
            },
          ],
        },
      ],
    })
    const input = useRoutineDraftStore.getState().toRoutineInput()
    expect(input.days[0]!.exercises[0]!.setTargets).toHaveLength(2)
  })

  it("marks dirty and reorders days when the move is real", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        routine.days[0]!,
        { id: "d2", weekday: 2, label: null, exercises: [] },
      ],
    })
    useRoutineDraftStore.getState().moveDay(0, 1)
    expect(useRoutineDraftStore.getState().isDirty).toBe(true)
    expect(useRoutineDraftStore.getState().days[0]?.weekday).toBe(2)
    expect(useRoutineDraftStore.getState().days[1]?.weekday).toBe(1)
  })
})
