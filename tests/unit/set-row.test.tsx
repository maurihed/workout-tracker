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
})
