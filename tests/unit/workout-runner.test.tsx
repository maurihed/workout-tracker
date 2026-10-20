import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))
const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))
vi.mock("@/features/workouts/components/swap-exercise-sheet", () => ({
  SwapExerciseSheet: () => null,
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock("sonner", () => ({ toast: { error: toastError } }))

const sync = vi.hoisted(() => ({
  status: { online: true, pending: 0, syncing: false, flush: vi.fn() },
  enqueueState: vi.fn(),
  complete: vi.fn(async () => {}),
  abandon: vi.fn(async () => {}),
}))
vi.mock("@/features/workouts/hooks/use-session-sync", () => ({
  useSessionSync: () => sync,
}))

import {
  WorkoutRunner,
  type RunnerSessionInput,
} from "@/features/workouts/components/workout-runner"
import {
  useSessionStore,
  type SessionStoreSource,
} from "@/features/workouts/stores/session-store"

const storeSession: SessionStoreSource = {
  id: "s1",
  name: "Push",
  status: "in_progress",
  startedAt: "2026-01-01T00:00:00.000Z",
  activeSeconds: 0,
  exercises: [
    {
      id: "se1",
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

const session: RunnerSessionInput = {
  id: "s1",
  exercises: [
    {
      exerciseId: "e1",
      timerType: "none",
      workSeconds: null,
      restSeconds: 60,
      rounds: null,
      exercise: null,
      lastPerformance: null,
    },
  ],
}

const customSession: RunnerSessionInput = {
  id: "s1",
  exercises: [
    {
      exerciseId: "e1",
      timerType: "none",
      workSeconds: null,
      restSeconds: 60,
      rounds: null,
      exercise: {
        id: "e1",
        name: "Squat",
        nameEs: null,
        images: [],
        isCustom: true,
        instructions: ["Cradle the bar in your elbows.", "Stand up tall."],
      },
      lastPerformance: null,
    },
  ],
}

beforeEach(() => {
  useSessionStore.getState().reset()
  useSessionStore.getState().hydrate(storeSession, {
    snapshot: null,
    routineDayId: null,
  })
  sync.enqueueState.mockReset()
  sync.complete.mockReset()
  sync.complete.mockResolvedValue(undefined)
  sync.abandon.mockReset()
  sync.abandon.mockResolvedValue(undefined)
  sync.status.online = true
  sync.status.pending = 0
  sync.status.syncing = false
  sync.status.flush.mockReset()
  toastError.mockReset()
  push.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("WorkoutRunner store ownership", () => {
  it("renders the seeded store without hydrating it itself", () => {
    render(<WorkoutRunner session={session} />)

    expect(useSessionStore.getState().sessionId).toBe("s1")
    expect(useSessionStore.getState().exercises).toHaveLength(1)
    expect(screen.getByText("Squat")).toBeInTheDocument()
  })

  it("shows how-to steps for a custom exercise", () => {
    render(<WorkoutRunner session={customSession} />)

    expect(screen.getByText("customExercise")).toBeInTheDocument()
    expect(
      screen.getByText("Cradle the bar in your elbows."),
    ).toBeInTheDocument()
    expect(screen.getByText("Stand up tall.")).toBeInTheDocument()
  })

  it("resets the store on unmount so the page can re-hydrate", () => {
    const { unmount } = render(<WorkoutRunner session={session} />)

    unmount()

    expect(useSessionStore.getState().sessionId).toBeNull()
  })
})

describe("WorkoutRunner sync status", () => {
  it("reports saved when online with nothing pending, with a sound toggle", () => {
    render(<WorkoutRunner session={session} />)

    expect(screen.getByRole("status")).toHaveTextContent("save.saved")

    fireEvent.click(screen.getByRole("button", { name: "soundOn" }))
    expect(window.localStorage.getItem("gym.runner.sound")).toBe("off")
    expect(screen.getByRole("button", { name: "soundOff" })).toBeInTheDocument()
  })

  it("surfaces offline and pending sync counts", () => {
    sync.status.online = false
    const { unmount } = render(<WorkoutRunner session={session} />)
    expect(screen.getByRole("status")).toHaveTextContent("save.offline")
    unmount()

    sync.status.online = true
    sync.status.pending = 2
    render(<WorkoutRunner session={session} />)
    expect(screen.getByRole("status")).toHaveTextContent("save.pending")
  })

  it("renders a retry button while online with pending rows and flushes on tap", () => {
    sync.status.pending = 2
    render(<WorkoutRunner session={session} />)

    fireEvent.click(screen.getByRole("button", { name: "save.retry" }))

    expect(sync.status.flush).toHaveBeenCalledTimes(1)
  })

  it("enqueues the session when the user pauses", () => {
    render(<WorkoutRunner session={session} />)

    fireEvent.click(screen.getByRole("button", { name: "pause" }))

    expect(sync.enqueueState).toHaveBeenCalled()
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

describe("WorkoutRunner finish and discard", () => {
  it("completes the session and navigates to the summary", async () => {
    const user = userEvent.setup()
    render(<WorkoutRunner session={session} />)

    await user.click(screen.getByRole("button", { name: "finish" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "finish" }))

    expect(sync.complete).toHaveBeenCalledWith(0)
    expect(push).toHaveBeenCalledWith("/en/workout/summary/s1")
  })

  it("abandons the session and navigates to the dashboard", async () => {
    const user = userEvent.setup()
    render(<WorkoutRunner session={session} />)

    await user.click(screen.getByRole("button", { name: "discard" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "discard" }))

    expect(sync.abandon).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith("/en/dashboard")
  })

  it("still navigates to the summary when completing fails", async () => {
    sync.complete.mockRejectedValueOnce(new Error("offline"))
    const user = userEvent.setup()
    render(<WorkoutRunner session={session} />)

    await user.click(screen.getByRole("button", { name: "finish" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "finish" }))

    expect(toastError).toHaveBeenCalledWith("save.finishError")
    expect(push).toHaveBeenCalledWith("/en/workout/summary/s1")
  })

  it("still navigates to the dashboard when discarding fails", async () => {
    sync.abandon.mockRejectedValueOnce(new Error("offline"))
    const user = userEvent.setup()
    render(<WorkoutRunner session={session} />)

    await user.click(screen.getByRole("button", { name: "discard" }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "discard" }))

    expect(push).toHaveBeenCalledWith("/en/dashboard")
  })
})

describe("WorkoutRunner timed exercises", () => {
  const timedStoreSession: SessionStoreSource = {
    ...storeSession,
    exercises: [
      {
        ...storeSession.exercises[0]!,
        timerType: "interval",
        workSeconds: 30,
        restSeconds: 15,
        rounds: 3,
      },
    ],
  }
  const timedSession: RunnerSessionInput = {
    id: "s1",
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
      .hydrate(timedStoreSession, { snapshot: null, routineDayId: null })
    render(<WorkoutRunner session={timedSession} />)

    const region = screen.getByRole("region", { name: "interval" })
    await user.click(within(region).getByRole("button", { name: "start" }))
    await user.click(within(region).getByRole("button", { name: "pause" }))
    await user.click(within(region).getByRole("button", { name: "skipRound" }))
  })
})
