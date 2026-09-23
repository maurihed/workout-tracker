import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { SetRow } from "@/features/workouts/components/set-row"

const set = { setNumber: 1, type: "working" as const, reps: null, weightKg: null, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: null }

describe("SetRow", () => {
  it("reports reps and weight changes (in kg)", async () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    render(<SetRow set={set} unitSystem="metric" onChange={onChange} onComplete={onComplete} />)
    await userEvent.type(screen.getByLabelText(/reps/i), "8")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ reps: 8 }))
    await userEvent.click(screen.getByRole("checkbox", { name: /complete/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it("commits metric weight exactly as typed across a multi-keystroke sequence", async () => {
    const onChange = vi.fn()
    render(<SetRow set={set} unitSystem="metric" onChange={onChange} onComplete={vi.fn()} />)
    const weight = screen.getByLabelText(/weight/i)
    await userEvent.type(weight, "100")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 100 }))
    expect(weight).toHaveValue(100)
  })

  it("keeps the typed draft in imperial while committing the converted kg value", async () => {
    const onChange = vi.fn()
    render(<SetRow set={set} unitSystem="imperial" onChange={onChange} onComplete={vi.fn()} />)
    const weight = screen.getByLabelText(/weight/i)
    await userEvent.type(weight, "100")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ weightKg: 45.4 }))
    expect(weight).toHaveValue(100)
  })

  it("displays the prefill for a set with no value yet", () => {
    render(
      <SetRow
        set={set}
        unitSystem="metric"
        prefill={{ reps: 10, weightKg: 40 }}
        onChange={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/reps/i)).toHaveValue(10)
    expect(screen.getByLabelText(/weight/i)).toHaveValue(40)
  })

  it("prefers the set's own values over the prefill", () => {
    render(
      <SetRow
        set={{ ...set, reps: 8, weightKg: 60 }}
        unitSystem="metric"
        prefill={{ reps: 10, weightKg: 40 }}
        onChange={vi.fn()}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/reps/i)).toHaveValue(8)
    expect(screen.getByLabelText(/weight/i)).toHaveValue(60)
  })
})
