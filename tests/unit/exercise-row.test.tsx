import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))

import { ExerciseRow } from "@/features/routines/components/exercise-row"

const exercise = { id: "x1", exerciseId: "e1", name: "Squat", targetSets: 1, targetReps: "10", restSeconds: 60, targetWeightKg: null, setTargets: [{ reps: 10, weightKg: null, rpe: null }], timerType: "none" as const, workSeconds: null, rounds: null, notes: null }

describe("ExerciseRow", () => {
  it("shows the name and fires an edit on reps change", () => {
    const onChange = vi.fn()
    render(<ExerciseRow exercise={exercise} onChange={onChange} onRemove={vi.fn()} />)
    expect(screen.getByText("Squat")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("sets.x1.1.reps"), { target: { value: "5" } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetSets: 1, setTargets: [{ reps: 5, weightKg: null, rpe: null }] }),
    )
  })
})
