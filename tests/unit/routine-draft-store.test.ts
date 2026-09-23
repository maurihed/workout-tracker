import { beforeEach, describe, expect, it } from "vitest"
import { useRoutineDraftStore } from "@/features/routines/stores/routine-draft-store"

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
})
