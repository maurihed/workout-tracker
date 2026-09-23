import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const hooks = vi.hoisted(() => ({
  activeSession: vi.fn(),
  activeRoutine: vi.fn(),
  start: { mutate: vi.fn(), reset: vi.fn(), isError: false, isPending: false },
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
vi.mock("@/features/workouts/hooks/use-start-session", () => ({
  useStartSession: () => hooks.start,
}))
vi.mock("@/features/workouts/components/workout-runner", () => ({
  WorkoutRunner: () => <div data-testid="runner" />,
}))

import WorkoutPage from "@/app/[locale]/(app)/workout/page"

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

beforeEach(() => {
  hooks.activeSession.mockReset()
  hooks.activeRoutine.mockReset()
  hooks.start.mutate.mockReset()
  hooks.start.reset.mockReset()
})

describe("WorkoutPage auto-start", () => {
  it("does not start a new session when a resumed session later completes", () => {
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query({ id: "s1" }))

    const { rerender } = render(<WorkoutPage />)
    expect(screen.getByTestId("runner")).toBeInTheDocument()

    // `useCompleteSession` invalidates `active`, flipping it to null while the
    // page is still mounted (before navigation to the summary).
    hooks.activeSession.mockReturnValue(query(null))
    rerender(<WorkoutPage />)

    expect(hooks.start.mutate).not.toHaveBeenCalled()
  })

  it("starts a single-day routine once when no session is in progress", () => {
    hooks.activeRoutine.mockReturnValue(query(routine))
    hooks.activeSession.mockReturnValue(query(null))

    render(<WorkoutPage />)

    expect(hooks.start.mutate).toHaveBeenCalledTimes(1)
    expect(hooks.start.mutate).toHaveBeenCalledWith("d1")
  })
})
