import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const localeMock = vi.hoisted(() => ({ value: "en" }))

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => localeMock.value,
}))

afterEach(() => {
  localeMock.value = "en"
})

import { RoutinePreview } from "@/features/routines/components/routine-preview"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1",
  name: "Full Body 3x",
  nameEs: "Cuerpo Completo 3x",
  description: null,
  descriptionEs: null,
  goal: "general_fitness",
  source: "template",
  isActive: true,
  days: [
    {
      id: "d1",
      weekday: 1,
      label: "Full Body A",
      order: 0,
      exercises: [
        {
          id: "e1",
          order: 0,
          exerciseId: "x1",
          customName: null,
          targetSets: 3,
          targetReps: "8-12",
          restSeconds: 90,
          targetWeightKg: null,
          timerType: "none",
          workSeconds: null,
          rounds: null,
          notes: null,
          exercise: {
            id: "x1",
            name: "Barbell Squat",
            nameEs: "Sentadilla con barra",
            images: [],
          },
        },
      ],
    },
  ],
}

describe("RoutinePreview", () => {
  it("shows the routine name, a day, and an exercise", () => {
    render(<RoutinePreview routine={routine} />)
    expect(screen.getByText("Full Body 3x")).toBeInTheDocument()
    expect(screen.getByText("Full Body A")).toBeInTheDocument()
    expect(screen.getByText(/Barbell Squat/)).toBeInTheDocument()
  })

  it("shows the prescription and links the Start workout CTA to the runner", () => {
    render(<RoutinePreview routine={routine} />)
    expect(screen.getByText("3 × 8-12")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /startWorkout/ })).toHaveAttribute(
      "href",
      "/en/workout",
    )
  })

  it("renders Spanish routine and exercise names when the locale is es", () => {
    localeMock.value = "es"
    render(<RoutinePreview routine={routine} />)
    expect(screen.getByText("Cuerpo Completo 3x")).toBeInTheDocument()
    expect(screen.getByText("Sentadilla con barra")).toBeInTheDocument()
    expect(screen.queryByText("Full Body 3x")).not.toBeInTheDocument()
  })
})
