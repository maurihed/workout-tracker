import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))
// Mock the real module path (the plan's `components/weekdays` is virtual and
// would not intercept the import made by the component).
vi.mock("@/features/routines/lib/weekdays", () => ({
  weekdayLabel: () => "Monday",
}))

import { DayChooser } from "@/features/workouts/components/day-chooser"

const routine = {
  id: "r1",
  name: "PPL",
  days: [
    { id: "d1", weekday: 1, label: "Push", order: 0, exercises: [{ id: "x" }] },
    { id: "d2", weekday: 3, label: "Pull", order: 1, exercises: [{ id: "y" }] },
  ],
}

describe("DayChooser", () => {
  it("lists days and reports the picked day", async () => {
    const onPick = vi.fn()
    render(<DayChooser routine={routine as never} onPick={onPick} />)
    await userEvent.click(screen.getByRole("button", { name: /push/i }))
    expect(onPick).toHaveBeenCalledWith("d1")
  })

  it("falls back to the weekday label when a day has no label", () => {
    const unlabeled = {
      ...routine,
      days: [{ id: "d3", weekday: 1, label: null, order: 0, exercises: [] }],
    }
    render(<DayChooser routine={unlabeled as never} onPick={vi.fn()} />)
    expect(screen.getByRole("button", { name: /monday/i })).toBeInTheDocument()
  })
})
