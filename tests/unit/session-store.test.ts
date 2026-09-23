import { beforeEach, describe, expect, it } from "vitest"
import { useSessionStore } from "@/features/workouts/stores/session-store"

const session = {
  id: "s1", name: "Push", status: "in_progress" as const, startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0,
  exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 3, targetReps: "10", restSeconds: 60, timerType: "none" as const, workSeconds: null, rounds: null, completed: false, skipped: false, notes: null, sets: [] }],
}

describe("session store", () => {
  beforeEach(() => useSessionStore.getState().reset())

  it("hydrates and logs a set, marking the session dirty", () => {
    useSessionStore.getState().hydrate(session)
    expect(useSessionStore.getState().currentIndex).toBe(0)
    useSessionStore.getState().addSet("se1")
    useSessionStore.getState().toggleSet("se1", 1, { reps: 8, weightKg: 40, type: "working" })
    const st = useSessionStore.getState()
    expect(st.exercises[0]?.sets).toHaveLength(1)
    expect(st.exercises[0]?.sets[0]?.reps).toBe(8)
    expect(st.isDirty).toBe(true)
  })

  it("swap changes exerciseId + nameSnapshot and records swapped-from", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().swapExercise("se1", { exerciseId: "e9", nameSnapshot: "Goblet Squat" })
    const ex = useSessionStore.getState().exercises[0]!
    expect(ex.exerciseId).toBe("e9")
    expect(ex.nameSnapshot).toBe("Goblet Squat")
    expect(ex.swappedFromId).toBe("e1")
  })

  it("toStateInput produces a server-shaped payload", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().setActiveSeconds(120)
    const input = useSessionStore.getState().toStateInput()
    expect(input.activeSeconds).toBe(120)
    expect(input.exercises[0]?.id).toBe("se1")
  })
})
