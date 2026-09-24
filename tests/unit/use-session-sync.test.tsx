import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { closeDb, listOutbox } from "@/lib/offline/db"
import { loadActiveSession } from "@/features/workouts/lib/session-persistence"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import { useSessionSync } from "@/features/workouts/hooks/use-session-sync"
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"

const enqueueMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/offline/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/sync")>()
  enqueueMock.mockImplementation(actual.enqueue)
  return { ...actual, enqueue: enqueueMock }
})

afterEach(async () => { await closeDb(); vi.unstubAllGlobals(); enqueueMock.mockClear() })

const snapshot: SessionSnapshot = {
  routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push",
  exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 1, targetReps: "10", restSeconds: 0, targetWeightKg: null, setTargets: null, timerType: "none", workSeconds: null, rounds: null }],
}

describe("useSessionSync", () => {
  it("debounces an upsert through the outbox and flushes it", async () => {
    useSessionStore.getState().hydrate(
      { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0, exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 1, targetReps: "10", restSeconds: 0, timerType: "none", workSeconds: null, rounds: null, completed: false, skipped: false, swappedFromId: null, notes: null, sets: [] }] },
      { snapshot, routineDayId: "d1" },
    )
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchImpl)
    const { result } = renderHook(() => useSessionSync("s1", () => null, () => false))
    await act(async () => { result.current.enqueueState() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)) })
    expect(fetchImpl).toHaveBeenCalled()
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe("/api/sessions/s1")
    expect((await listOutbox()).length).toBe(0)
  })

  it("persists an exercise edit to IndexedDB before the debounce fires", async () => {
    useSessionStore.getState().hydrate(
      { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0, exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 1, targetReps: "10", restSeconds: 0, timerType: "none", workSeconds: null, rounds: null, completed: false, skipped: false, swappedFromId: null, notes: null, sets: [] }] },
      { snapshot, routineDayId: "d1" },
    )
    renderHook(() => useSessionSync("s1", () => null, () => false))

    await act(async () => {
      useSessionStore.getState().addSet("se1")
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const persisted = await loadActiveSession()
    expect(persisted?.source.exercises[0]?.sets).toHaveLength(1)
    expect(await listOutbox()).toHaveLength(0)
  })

  it("persists a completed session and resolves when the outbox enqueue rejects", async () => {
    useSessionStore.getState().hydrate(
      { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0, exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 1, targetReps: "10", restSeconds: 0, timerType: "none", workSeconds: null, rounds: null, completed: false, skipped: false, swappedFromId: null, notes: null, sets: [] }] },
      { snapshot, routineDayId: "d1" },
    )
    enqueueMock.mockRejectedValueOnce(new Error("indexeddb unavailable"))
    const { result } = renderHook(() => useSessionSync("s1", () => null, () => false))

    await act(async () => {
      await expect(result.current.complete(42)).resolves.toBeUndefined()
    })

    const persisted = await loadActiveSession()
    expect(persisted?.source.status).toBe("completed")
    expect(persisted?.source.activeSeconds).toBe(42)
  })
})
