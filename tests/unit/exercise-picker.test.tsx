import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const localeMock = vi.hoisted(() => ({ value: "en" }))

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => localeMock.value,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}))

const addExercises = vi.fn()
vi.mock("@/features/routines/stores/routine-draft-store", () => ({
  useRoutineDraftStore: (selector?: (state: unknown) => unknown) => {
    const state = { addExercises }
    return selector ? selector(state) : state
  },
}))
vi.mock("@/features/exercises/hooks/use-exercises", () => ({
  useExercises: () => ({
    data: {
      items: [
        {
          id: "c1",
          sourceId: "Squat",
          name: "Barbell Squat",
          nameEs: "Sentadilla con barra",
          equipment: "barbell",
          level: "beginner",
          category: "strength",
          primaryMuscles: ["quadriceps"],
          images: [],
        },
      ],
      nextCursor: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

import { ExercisePicker } from "@/features/routines/components/exercise-picker"

afterEach(() => {
  localeMock.value = "en"
  addExercises.mockClear()
})

describe("ExercisePicker", () => {
  it("selects exercises and adds them to the day", async () => {
    render(<ExercisePicker routineId="r1" dayId="d1" />)
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Barbell Squat/i }),
    )
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    expect(addExercises).toHaveBeenCalledWith("d1", [
      expect.objectContaining({ exerciseId: "c1", name: "Barbell Squat" }),
    ])
  })

  it("renders the Spanish name when the locale is es", () => {
    localeMock.value = "es"
    render(<ExercisePicker routineId="r1" dayId="d1" />)
    expect(screen.getByText("Sentadilla con barra")).toBeInTheDocument()
  })

  it("disables the add action until an exercise is selected", () => {
    render(<ExercisePicker routineId="r1" dayId="d1" />)
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled()
  })
})
