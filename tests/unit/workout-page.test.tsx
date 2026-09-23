import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const hooks = vi.hoisted(() => ({
  activeSession: vi.fn(),
  activeRoutine: vi.fn(),
  start: { mutate: vi.fn(), reset: vi.fn(), isError: false, isPending: false },
  persistence: {
    loadActiveSession: vi.fn(async (): Promise<unknown> => undefined),
    saveActiveSession: vi.fn(async (): Promise<unknown> => undefined),
    clearActiveSession: vi.fn(async (): Promise<unknown> => undefined),
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))
vi.mock("@/features/workouts/hooks/use-active-session", () => ({
  useActiveSession: hooks.activeSession,
}))
vi.mock("@/features/routines/hooks/use-active-routine", () => ({
  useActiveRoutine: hooks.activeRoutine,
}))
// `useMutation` returns a fresh result object every render, which is what made
// the auto-start effect re-run after the retry handler re-armed it. Mirror that
// here so the single-flight guard is actually exercised.
vi.mock("@/features/workouts/hooks/use-start-session", () => ({
  useStartSession: () => ({ ...hooks.start }),
}))
const runner = vi.hoisted(() => ({
  real: false,
  mutation: {
    mutate: vi.fn(),
    mutateAsync: vi.fn(async () => undefined),
    isPending: false,
    reset: vi.fn(),
  },
}))
vi.mock("@/features/workouts/components/workout-runner", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/workouts/components/workout-runner")
  >()
  return {
    ...actual,
    WorkoutRunner: (props: Parameters<typeof actual.WorkoutRunner>[0]) =>
      runner.real ? (
        <actual.WorkoutRunner {...props} />
      ) : (
        <div data-testid="runner" />
      ),
  }
})
vi.mock("@/features/workouts/lib/session-persistence", () => hooks.persistence)
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))
vi.mock("@/features/workouts/components/swap-exercise-sheet", () => ({
  SwapExerciseSheet: () => null,
}))
vi.mock("@/features/workouts/hooks/use-update-session", () => ({
  useUpdateSession: () => runner.mutation,
}))
vi.mock("@/features/workouts/hooks/use-complete-session", () => ({
  useCompleteSession: () => runner.mutation,
}))
vi.mock("@/features/workouts/hooks/use-abandon-session", () => ({
  useAbandonSession: () => runner.mutation,
}))

import WorkoutPage from "@/app/[locale]/(app)/workout/page"
import { useSessionStore } from "@/features/workouts/stores/session-store"

const routine = {
  id: "r1",
  name: "PPL",
  nameEs: null,
  description: null,
  descriptionEs: null,
  goal: null,
  source: "manual",
  isActive: true,
  days: [
    {
      id: "d1",
      weekday: 1,
      label: "Push",
      order: 0,
      exercises: [],
    },
  ],
}

function query<T>(data: T, isLoading = false) {
  return { data, isLoading, isError: false, refetch: vi.fn() }
}

const localSession = {
  source: {
    id: "s9",
    name: "Local Push",
    status: "in_progress",
    startedAt: "2026-01-01T00:00:00.000Z",
    activeSeconds: 5,
    exercises: [
      {
        id: "se9",
        exerciseId: "e1",
        nameSnapshot: "Squat",
        targetSets: 3,
        targetReps: "10",
        restSeconds: 60,
        timerType: "none",
        workSeconds: null,
        rounds: null,
        completed: false,
        skipped: false,
        swappedFromId: null,
        notes: null,
        sets: [],
      },
    ],
  },
  snapshot: null,
  routineDayId: "d1",
  timer: null,
  paused: false,
}

beforeEach(() => {
  useSessionStore.getState().reset()
  runner.real = false
  runner.mutation.mutateAsync.mockReset()
  runner.mutation.mutateAsync.mockResolvedValue(undefined)
  hooks.activeSession.mockReset()
  hooks.activeRoutine.mockReset()
  hooks.start.mutate.mockReset()
  hooks.start.reset.mockReset()
  hooks.start.isError = false
  hooks.start.isPending = false
  hooks.persistence.loadActiveSession.mockReset()
  hooks.persistence.loadActiveSession.mockResolvedValue(undefined)
  hooks.persistence.saveActiveSession.mockReset()
  hooks.persistence.saveActiveSession.mockResolvedValue(undefined)
})

describe("WorkoutPage auto-start", () => {
  it("does not start a new session when a resumed session later completes", async () => {
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query({ id: "s1", exercises: [] }))

    const { rerender } = render(<WorkoutPage />)
    await act(async () => {})
    expect(screen.getByTestId("runner")).toBeInTheDocument()

    // `useCompleteSession` invalidates `active`, flipping it to null while the
    // page is still mounted (before navigation to the summary).
    hooks.activeSession.mockReturnValue(query(null))
    rerender(<WorkoutPage />)
    await act(async () => {})

    expect(hooks.start.mutate).not.toHaveBeenCalled()
  })

  it("starts a single-day routine once when no session is in progress", async () => {
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    render(<WorkoutPage />)
    await act(async () => {})

    expect(hooks.start.mutate).toHaveBeenCalledTimes(1)
    expect(hooks.start.mutate).toHaveBeenCalledWith({ routine, dayId: "d1" })
  })

  it("issues exactly one start POST per attempt when Retry re-arms a single-day routine", async () => {
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))
    // Simulate the auto-start having failed: the error state (and Retry) shows.
    hooks.start.isError = true

    const { rerender } = render(<WorkoutPage />)
    await act(async () => {})
    expect(hooks.start.mutate).toHaveBeenCalledTimes(1)

    // Clicking Retry re-arms auto-start; without the single-flight guard the
    // re-run effect would fire a second POST for the same attempt.
    fireEvent.click(screen.getByRole("button", { name: "retry" }))
    rerender(<WorkoutPage />)

    expect(hooks.start.mutate).toHaveBeenCalledTimes(2)
    expect(hooks.start.mutate).toHaveBeenLastCalledWith({ routine, dayId: "d1" })
  })

  it("resumes a locally persisted session while offline", async () => {
    hooks.persistence.loadActiveSession.mockResolvedValue({
      source: {
        id: "s9",
        name: "Local Push",
        status: "in_progress",
        startedAt: "2026-01-01T00:00:00.000Z",
        activeSeconds: 5,
        exercises: [
          {
            id: "se9",
            exerciseId: "e1",
            nameSnapshot: "Squat",
            targetSets: 3,
            targetReps: "10",
            restSeconds: 60,
            timerType: "none",
            workSeconds: null,
            rounds: null,
            completed: false,
            skipped: false,
            swappedFromId: null,
            notes: null,
            sets: [],
          },
        ],
      },
      snapshot: null,
      routineDayId: "d1",
      timer: null,
      paused: false,
    })
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    render(<WorkoutPage />)
    await act(async () => {})

    expect(screen.getByTestId("runner")).toBeInTheDocument()
    expect(useSessionStore.getState().sessionId).toBe("s9")
    expect(useSessionStore.getState().exercises[0]?.nameSnapshot).toBe("Squat")
    expect(useSessionStore.getState().routineDayId).toBe("d1")
    expect(hooks.start.mutate).not.toHaveBeenCalled()
  })

  it("prefers a persisted local session over a different-id server session", async () => {
    hooks.persistence.loadActiveSession.mockResolvedValue(localSession)
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(
      query({ id: "s2", status: "in_progress", routineDayId: "d1", exercises: [] }),
    )

    render(<WorkoutPage />)
    await act(async () => {})

    expect(screen.getByTestId("runner")).toBeInTheDocument()
    expect(useSessionStore.getState().sessionId).toBe("s9")
    expect(useSessionStore.getState().exercises[0]?.nameSnapshot).toBe("Squat")
    expect(hooks.persistence.saveActiveSession).not.toHaveBeenCalled()
  })

  it("re-hydrates the store after the runner resets it on remount", async () => {
    const snapshot = {
      routineId: "r1",
      routineDayId: "d1",
      name: "Push",
      nameEs: null,
      weekday: 1,
      label: "Push",
      exercises: [],
    }
    hooks.persistence.loadActiveSession.mockResolvedValue({ ...localSession, snapshot })
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    const first = render(<WorkoutPage />)
    await act(async () => {})
    expect(useSessionStore.getState().sessionId).toBe("s9")
    expect(useSessionStore.getState().snapshot).toEqual(snapshot)

    await act(async () => {
      useSessionStore.getState().reset()
    })
    expect(useSessionStore.getState().sessionId).toBeNull()

    first.unmount()
    render(<WorkoutPage />)
    await act(async () => {})

    expect(useSessionStore.getState().sessionId).toBe("s9")
    expect(useSessionStore.getState().snapshot).toEqual(snapshot)
  })

  it("does not rewind an offline local-wins session on re-render", async () => {
    hooks.persistence.loadActiveSession.mockResolvedValue(localSession)
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    const { rerender } = render(<WorkoutPage />)
    await act(async () => {})
    expect(useSessionStore.getState().sessionId).toBe("s9")

    act(() => {
      useSessionStore.getState().setActiveSeconds(99)
    })
    expect(useSessionStore.getState().activeSeconds).toBe(99)

    rerender(<WorkoutPage />)
    await act(async () => {})
    expect(useSessionStore.getState().activeSeconds).toBe(99)

    act(() => {
      useSessionStore.getState().addSet("se9")
    })
    expect(useSessionStore.getState().exercises[0]?.sets).toHaveLength(1)

    rerender(<WorkoutPage />)
    await act(async () => {})
    expect(useSessionStore.getState().activeSeconds).toBe(99)
    expect(useSessionStore.getState().exercises[0]?.sets).toHaveLength(1)
  })

  it("hydrates a resumed server session from its stored snapshot", async () => {
    const serverSnapshot = {
      routineId: "r1",
      routineDayId: "d1",
      name: "Push",
      nameEs: null,
      weekday: 1,
      label: "Push",
      exercises: [],
    }
    const serverSession = {
      id: "s2",
      userId: "u1",
      routineId: "r1",
      routineDayId: "d1",
      name: "Push",
      status: "in_progress",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      activeSeconds: 5,
      notes: null,
      snapshot: serverSnapshot,
      exercises: [
        {
          id: "se2",
          exerciseId: "e1",
          order: 0,
          nameSnapshot: "Squat",
          targetSets: 3,
          targetReps: "10",
          restSeconds: 60,
          timerType: "none",
          workSeconds: null,
          rounds: null,
          completed: false,
          skipped: false,
          swappedFromId: null,
          notes: null,
          exercise: null,
          sets: [],
          lastPerformance: null,
        },
      ],
    }
    hooks.persistence.loadActiveSession.mockResolvedValue(undefined)
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(serverSession))

    render(<WorkoutPage />)
    await act(async () => {})

    expect(useSessionStore.getState().sessionId).toBe("s2")
    expect(useSessionStore.getState().snapshot).toEqual(serverSnapshot)
    expect(useSessionStore.getState().routineDayId).toBe("d1")
    expect(useSessionStore.getState().toUpsertPayload(0)).not.toBeNull()
  })

  it("hydrates canonical exercise ids and names with the real runner for an offline local-wins resume", async () => {
    runner.real = true
    hooks.persistence.loadActiveSession.mockResolvedValue(localSession)
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    render(<WorkoutPage />)
    await act(async () => {})

    const state = useSessionStore.getState()
    expect(state.sessionId).toBe("s9")
    expect(state.exercises[0]?.id).toBe("se9")
    expect(state.exercises[0]?.nameSnapshot).toBe("Squat")
  })
})
