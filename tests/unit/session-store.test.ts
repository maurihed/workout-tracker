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

  it("treats activeSeconds as a heartbeat that does not dirty the store", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().setActiveSeconds(120)
    expect(useSessionStore.getState().activeSeconds).toBe(120)
    expect(useSessionStore.getState().isDirty).toBe(false)
  })

  it("clamps activeSeconds to a non-negative integer", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().setActiveSeconds(-5)
    expect(useSessionStore.getState().activeSeconds).toBe(0)
    useSessionStore.getState().setActiveSeconds(12.9)
    expect(useSessionStore.getState().activeSeconds).toBe(12)
    expect(useSessionStore.getState().isDirty).toBe(false)
  })

  it("keeps the original provenance across repeated swaps", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().swapExercise("se1", { exerciseId: "e9", nameSnapshot: "Goblet Squat" })
    useSessionStore.getState().swapExercise("se1", { exerciseId: "e7", nameSnapshot: "Front Squat" })
    const ex = useSessionStore.getState().exercises[0]!
    expect(ex.exerciseId).toBe("e7")
    expect(ex.nameSnapshot).toBe("Front Squat")
    expect(ex.swappedFromId).toBe("e1")
  })

  it("re-hydrates a clean store for the same session id", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().hydrate({ ...session, activeSeconds: 300 })
    expect(useSessionStore.getState().activeSeconds).toBe(300)
    expect(useSessionStore.getState().isDirty).toBe(false)
  })

  it("does not clobber a dirty store on re-hydrate", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().addSet("se1")
    useSessionStore.getState().hydrate({ ...session, activeSeconds: 300 })
    expect(useSessionStore.getState().activeSeconds).toBe(0)
    expect(useSessionStore.getState().exercises[0]?.sets).toHaveLength(1)
  })

  it("appends sets with max+1 numbering and a working default", () => {
    useSessionStore.getState().hydrate({
      ...session,
      exercises: [
        {
          ...session.exercises[0]!,
          sets: [
            { setNumber: 1, type: "warmup" as const, reps: 10, weightKg: 20, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: null },
            { setNumber: 2, type: "working" as const, reps: 8, weightKg: 40, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: null },
          ],
        },
      ],
    })
    useSessionStore.getState().addSet("se1")
    const sets = useSessionStore.getState().exercises[0]!.sets
    expect(sets).toHaveLength(3)
    expect(sets[2]?.setNumber).toBe(3)
    expect(sets[2]?.type).toBe("working")
    expect(useSessionStore.getState().isDirty).toBe(true)
  })

  it("clamps goTo/next/prev navigation to the exercise range", () => {
    useSessionStore.getState().hydrate({
      ...session,
      exercises: [
        session.exercises[0]!,
        { ...session.exercises[0]!, id: "se2", nameSnapshot: "Bench" },
        { ...session.exercises[0]!, id: "se3", nameSnapshot: "Row" },
      ],
    })
    const { next, prev, goTo } = useSessionStore.getState()
    prev()
    expect(useSessionStore.getState().currentIndex).toBe(0)
    next()
    next()
    next()
    expect(useSessionStore.getState().currentIndex).toBe(2)
    prev()
    expect(useSessionStore.getState().currentIndex).toBe(1)
    goTo(99)
    expect(useSessionStore.getState().currentIndex).toBe(2)
    goTo(-5)
    expect(useSessionStore.getState().currentIndex).toBe(0)
  })

  it("does not dirty the store when an exercise update is a no-op", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().completeExercise("se1", false)
    useSessionStore.getState().skipExercise("se1", false)
    useSessionStore.getState().setNotes("se1", null)
    expect(useSessionStore.getState().isDirty).toBe(false)
    useSessionStore.getState().completeExercise("se1", true)
    expect(useSessionStore.getState().isDirty).toBe(true)
  })
})
