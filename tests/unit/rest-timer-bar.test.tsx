import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { RestTimerBar } from "@/features/workouts/components/rest-timer-bar"
import { startRest } from "@/features/workouts/lib/timer"

describe("RestTimerBar", () => {
  it("shows remaining time and adjust/skip controls", async () => {
    const onAdjust = vi.fn()
    const onSkip = vi.fn()
    render(<RestTimerBar timer={startRest(90)} onAdjust={onAdjust} onSkip={onSkip} />)
    expect(screen.getByText(/1:30|90/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /\+15/i }))
    expect(onAdjust).toHaveBeenCalledWith(15)
    await userEvent.click(screen.getByRole("button", { name: /skip/i }))
    expect(onSkip).toHaveBeenCalled()
  })
})
