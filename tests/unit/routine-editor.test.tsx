import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const routineMock = vi.hoisted(() => ({ value: null as unknown }))
const mutateAsync = vi.hoisted(() => vi.fn(async () => ({})))
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("sonner", () => ({ toast: toastMock }))
vi.mock("@/features/routines/hooks/use-routine", () => ({
  useRoutine: () => ({
    data: routineMock.value,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock("@/features/routines/hooks/use-update-routine", () => ({
  useUpdateRoutine: () => ({ mutateAsync, isPending: false, isError: false }),
}))
// Keep the test focused on the editor shell; the day/exercise widgets have
// their own coverage and pull in dnd-kit.
vi.mock("@/features/routines/components/day-list", () => ({
  DayList: () => <div data-testid="day-list" />,
}))

import { RoutineEditor } from "@/features/routines/components/routine-editor"
import { useRoutineDraftStore } from "@/features/routines/stores/routine-draft-store"

const routine = {
  id: "r1",
  name: "Plan",
  description: null,
  goal: null,
  source: "manual",
  isActive: false,
  days: [
    {
      id: "d1",
      weekday: 1,
      label: null,
      order: 0,
      exercises: [
        {
          id: "e1",
          order: 0,
          exerciseId: "c1",
          customName: null,
          targetSets: 3,
          targetReps: "10",
          restSeconds: 60,
          targetWeightKg: null,
          timerType: "none",
          workSeconds: null,
          rounds: null,
          notes: null,
          exercise: { id: "c1", name: "Squat", nameEs: null, images: [] },
        },
      ],
    },
  ],
}

beforeEach(() => {
  routineMock.value = routine
  mutateAsync.mockClear()
  toastMock.success.mockClear()
  useRoutineDraftStore.getState().clearDraft()
  sessionStorage.clear()
})

describe("RoutineEditor", () => {
  it("shows a validation error and does not save when the name is empty", async () => {
    render(<RoutineEditor routineId="r1" />)
    const nameInput = await screen.findByLabelText("name")
    await userEvent.clear(nameInput)
    await userEvent.click(screen.getByRole("button", { name: "save" }))
    expect(await screen.findByText("validationError")).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it("shows the unsaved indicator and arms the unload guard once dirty", async () => {
    render(<RoutineEditor routineId="r1" />)
    const nameInput = await screen.findByLabelText("name")
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument()

    await userEvent.type(nameInput, "!")

    expect(await screen.findByText("unsaved")).toBeInTheDocument()
    await waitFor(() => {
      const event = new Event("beforeunload", { cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
  })

  it("saves a valid draft and clears it", async () => {
    render(<RoutineEditor routineId="r1" />)
    const nameInput = await screen.findByLabelText("name")
    await userEvent.type(nameInput, "!")
    await userEvent.click(screen.getByRole("button", { name: "save" }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
  })
})
