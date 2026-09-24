import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { ExerciseRow } from "@/features/routines/components/exercise-row"

const exercise = { id: "x1", exerciseId: "e1", name: "Squat", targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: null, setTargets: [], timerType: "none" as const, workSeconds: null, rounds: null, notes: null }

describe("ExerciseRow", () => {
  it("shows the name and fires an edit on sets change", async () => {
    const onChange = vi.fn()
    render(<ExerciseRow exercise={exercise} onChange={onChange} onRemove={vi.fn()} />)
    expect(screen.getByText("Squat")).toBeInTheDocument()
    const sets = screen.getByLabelText(/sets/i)
    await userEvent.clear(sets)
    await userEvent.type(sets, "5")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 5 }))
  })
})
