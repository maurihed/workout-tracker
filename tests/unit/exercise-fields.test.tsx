import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const { profileState } = vi.hoisted(() => ({
  profileState: { unitSystem: "metric" as "metric" | "imperial" },
}))

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: profileState.unitSystem } }),
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

function Harness({ initial }: { initial: DraftExercise }) {
  const [current, setCurrent] = useState(initial)
  return (
    <>
      <ExerciseFields
        exercise={current}
        onChange={(patch) => setCurrent((prev) => ({ ...prev, ...patch }))}
      />
      <output data-testid="first-weight">{String(current.setTargets[0]?.weightKg)}</output>
    </>
  )
}

describe("ExerciseFields", () => {
  afterEach(() => {
    profileState.unitSystem = "metric"
  })

  it("edits a single set's reps and keeps the set count in sync", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("sets.re1.1.reps"), { target: { value: "15" } })
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
    fireEvent.click(screen.getByRole("button", { name: "sets.re1.2.remove" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 1 }))
  })

  it("namespaces control ids per exercise to avoid duplicate DOM ids", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    expect(screen.getByLabelText("sets.re1.1.weight")).toBeInTheDocument()
    expect(screen.getByLabelText("sets.re1.2.rpe")).toBeInTheDocument()
  })

  it("ignores a zero weight instead of persisting an invalid value", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("sets.re1.1.weight"), { target: { value: "0" } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setTargets: [
          { reps: 12, weightKg: null, rpe: 7 },
          { reps: 10, weightKg: 45, rpe: 8 },
        ],
      }),
    )
  })

  it("commits null when the weight field is cleared", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("sets.re1.1.weight"), { target: { value: "" } })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        setTargets: [
          { reps: 12, weightKg: null, rpe: 7 },
          { reps: 10, weightKg: 45, rpe: 8 },
        ],
      }),
    )
  })

  it("keeps a multi-digit imperial draft intact while committing the converted kg", async () => {
    profileState.unitSystem = "imperial"
    const noWeight: DraftExercise = {
      ...exercise,
      targetWeightKg: null,
      setTargets: [
        { reps: 12, weightKg: null, rpe: 7 },
        { reps: 10, weightKg: 45, rpe: 8 },
      ],
    }
    render(<Harness initial={noWeight} />)
    const weight = screen.getByLabelText("sets.re1.1.weight")
    await userEvent.type(weight, "225")
    expect(weight).toHaveValue(225)
    expect(screen.getByTestId("first-weight")).toHaveTextContent("102.1")
  })
})
