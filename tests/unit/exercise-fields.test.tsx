import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))

import { ExerciseFields } from "@/features/routines/components/exercise-fields"
import type { DraftExercise } from "@/features/routines/stores/routine-draft-store"

const exercise: DraftExercise = {
  id: "re1",
  exerciseId: "e1",
  name: "Squat",
  targetSets: 2,
  targetReps: "12",
  restSeconds: 90,
  targetWeightKg: 40,
  setTargets: [
    { reps: 12, weightKg: 40, rpe: 7 },
    { reps: 10, weightKg: 45, rpe: 8 },
  ],
  timerType: "none",
  workSeconds: null,
  rounds: null,
  notes: null,
}

describe("ExerciseFields", () => {
  it("edits a single set's reps and keeps the set count in sync", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("sets.1.reps"), { target: { value: "15" } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSets: 2,
        setTargets: [
          { reps: 15, weightKg: 40, rpe: 7 },
          { reps: 10, weightKg: 45, rpe: 8 },
        ],
      }),
    )
  })

  it("adds and removes sets", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "addSet" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 3 }))
    onChange.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "sets.2.remove" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 1 }))
  })
})
