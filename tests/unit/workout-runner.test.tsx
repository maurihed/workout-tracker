import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))
vi.mock("@/features/workouts/components/swap-exercise-sheet", () => ({
  SwapExerciseSheet: () => null,
}))

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(async () => undefined),
  isPending: false,
  reset: vi.fn(),
}))
vi.mock("@/features/workouts/hooks/use-update-session", () => ({
  useUpdateSession: () => mutation,
}))
vi.mock("@/features/workouts/hooks/use-complete-session", () => ({
  useCompleteSession: () => mutation,
}))
vi.mock("@/features/workouts/hooks/use-abandon-session", () => ({
  useAbandonSession: () => mutation,
}))

import { WorkoutRunner } from "@/features/workouts/components/workout-runner"
import type { SessionDTO } from "@/features/workouts/hooks/use-active-session"
import { useSessionStore } from "@/features/workouts/stores/session-store"

const session: SessionDTO = {
  id: "s1",
  userId: "u1",
  routineId: null,
  routineDayId: null,
  name: "Push",
  status: "in_progress",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  activeSeconds: 0,
  notes: null,
  snapshot: null,
  exercises: [
    {
      id: "se1",
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
      lastPerformance: null,
      sets: [
        {
          id: "set1",
          setNumber: 1,
          type: "working",
          reps: 10,
          weightKg: null,
          durationSeconds: null,
          rpe: null,
          restSecondsLogged: null,
          completedAt: null,
        },
      ],
    },
  ],
}

beforeEach(() => {
  useSessionStore.getState().reset()
  useSessionStore.getState().hydrate(session, {
    snapshot: null,
    routineDayId: null,
  })
  mutation.mutateAsync.mockReset()
  mutation.mutateAsync.mockResolvedValue(undefined)
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("WorkoutRunner store ownership", () => {
  it("renders the seeded store without hydrating it itself", () => {
    render(<WorkoutRunner session={session} />)

    expect(useSessionStore.getState().sessionId).toBe("s1")
    expect(useSessionStore.getState().exercises).toHaveLength(1)
    expect(screen.getByText("Squat")).toBeInTheDocument()
  })

  it("resets the store on unmount so the page can re-hydrate", () => {
    const { unmount } = render(<WorkoutRunner session={session} />)

    unmount()

    expect(useSessionStore.getState().sessionId).toBeNull()
  })
})

describe("WorkoutRunner save status", () => {
  it("pushes on pause and reports saved, with a sound toggle", async () => {
    vi.useFakeTimers()
    render(<WorkoutRunner session={session} />)

    const status = screen.getByRole("status")
    fireEvent.click(screen.getByRole("button", { name: "pause" }))
    await flush(0)
    await flush(0)

    expect(mutation.mutateAsync).toHaveBeenCalled()
    expect(status).toHaveTextContent("save.saved")

    // The persisted sound toggle flips and writes to storage.
    fireEvent.click(screen.getByRole("button", { name: "soundOn" }))
    expect(window.localStorage.getItem("gym.runner.sound")).toBe("off")
    expect(screen.getByRole("button", { name: "soundOff" })).toBeInTheDocument()
  })

  it("surfaces a save error and retries on demand", async () => {
    vi.useFakeTimers()
    mutation.mutateAsync.mockRejectedValueOnce(new Error("network"))
    render(<WorkoutRunner session={session} />)

    fireEvent.click(screen.getByRole("button", { name: "pause" }))
    await flush(0)
    await flush(0)

    expect(screen.getByRole("status")).toHaveTextContent("save.error")

    fireEvent.click(screen.getByRole("button", { name: "save.retry" }))
    await flush(0)
    await flush(0)
    expect(screen.getByRole("status")).toHaveTextContent("save.saved")
  })

  it("does not retry a terminal 4xx save and refetches the session on 409", async () => {
    vi.useFakeTimers()
    const onSessionConflict = vi.fn()
    const conflict = Object.assign(new Error("conflict"), { status: 409 })
    mutation.mutateAsync.mockRejectedValueOnce(conflict)
    render(
      <WorkoutRunner session={session} onSessionConflict={onSessionConflict} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "pause" }))
    await flush(0)
    await flush(0)

    expect(screen.getByRole("status")).toHaveTextContent("save.error")
    expect(onSessionConflict).toHaveBeenCalledTimes(1)

    const calls = mutation.mutateAsync.mock.calls.length
    // Advance far past the max backoff: a terminal failure must not loop.
    await flush(60_000)
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(calls)
  })

  it("logs a set, marks the exercise dirty, and starts the rest timer", async () => {
    const user = userEvent.setup()
    render(<WorkoutRunner session={session} />)

    await user.click(screen.getByRole("checkbox", { name: "sets.complete" }))

    expect(useSessionStore.getState().isDirty).toBe(true)
    expect(useSessionStore.getState().exercises[0]?.completed).toBe(true)
    expect(screen.getByRole("region", { name: "rest" })).toBeInTheDocument()
  })
})

describe("WorkoutRunner timed exercises", () => {
  const timedSession: SessionDTO = {
    ...session,
    exercises: [
      {
        ...session.exercises[0]!,
        timerType: "interval",
        workSeconds: 30,
        restSeconds: 15,
        rounds: 3,
      },
    ],
  }

  it("renders the interval timer and wires start/pause/skip-round", async () => {
    const user = userEvent.setup()
    useSessionStore
      .getState()
      .hydrate(timedSession, { snapshot: null, routineDayId: null })
    render(<WorkoutRunner session={timedSession} />)

    const region = screen.getByRole("region", { name: "interval" })
    await user.click(within(region).getByRole("button", { name: "start" }))
    await user.click(within(region).getByRole("button", { name: "pause" }))
    await user.click(within(region).getByRole("button", { name: "skipRound" }))
  })
})
