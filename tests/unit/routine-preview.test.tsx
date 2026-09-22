import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))

import { RoutinePreview } from "@/features/routines/components/routine-preview"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1",
  name: "Full Body 3x",
  description: null,
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
            nameEs: null,
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

  it("shows the prescription and a disabled Start workout CTA", () => {
    render(<RoutinePreview routine={routine} />)
    expect(screen.getByText("3 × 8-12")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /startWorkout/ })).toBeDisabled()
    expect(screen.getByText("comingSoon")).toBeInTheDocument()
  })
})
