import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { IntervalTimer } from "@/features/workouts/components/interval-timer"
import { pause, startInterval } from "@/features/workouts/lib/timer"

describe("IntervalTimer", () => {
  it("pauses while running, resumes once paused, and skips a round", async () => {
    const onStart = vi.fn()
    const onPause = vi.fn()
    const onSkipRound = vi.fn()
    const running = startInterval({ workSeconds: 30, restSeconds: 15, rounds: 3 })

    const { rerender } = render(
      <IntervalTimer
        timer={running}
        onStart={onStart}
        onPause={onPause}
        onSkipRound={onSkipRound}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /pause/i }))
    expect(onPause).toHaveBeenCalled()

    rerender(
      <IntervalTimer
        timer={pause(running)}
        onStart={onStart}
        onPause={onPause}
        onSkipRound={onSkipRound}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /start/i }))
    expect(onStart).toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /skipRound/i }))
    expect(onSkipRound).toHaveBeenCalled()
  })

  it("renders the countdown as m:ss", () => {
    const timer = startInterval({ workSeconds: 90, restSeconds: 15, rounds: 3 })
    render(
      <IntervalTimer
        timer={timer}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onSkipRound={vi.fn()}
      />,
    )
    expect(screen.getByText("1:30")).toBeInTheDocument()
  })
})
