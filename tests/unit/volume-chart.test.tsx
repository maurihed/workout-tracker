import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { VolumeChart } from "@/features/progress/components/volume-chart"
import type { WeekBucket } from "@/features/progress/lib/volume"
import en from "@/i18n/messages/en.json"

const data: WeekBucket[] = [
  { weekStart: "2026-01-05", volumeKg: 1500, sessions: 2 },
  { weekStart: "2026-01-12", volumeKg: 900.5, sessions: 1 },
]

function renderChart(
  volumeByWeek: WeekBucket[] = data,
  weeks = 12,
  onWeeksChange = vi.fn(),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VolumeChart
        volumeByWeek={volumeByWeek}
        weeks={weeks}
        onWeeksChange={onWeeksChange}
      />
    </NextIntlClientProvider>,
  )
}

describe("VolumeChart", () => {
  it("renders the weekly volume with data", () => {
    const { container } = renderChart()
    expect(container.querySelector(".recharts-surface")).not.toBeNull()
    expect(screen.getByText("1500 kg")).toBeInTheDocument()
    expect(screen.getByText("900.5 kg")).toBeInTheDocument()
    expect(screen.queryByText(en.analytics.empty)).not.toBeInTheDocument()
  })

  it("shows an empty state without data", () => {
    const { container } = renderChart([])
    expect(screen.getByText(en.analytics.empty)).toBeInTheDocument()
    expect(container.querySelector(".recharts-surface")).toBeNull()
  })

  it("switches the window through the 4/12/26 toggle", async () => {
    const onWeeksChange = vi.fn()
    const user = userEvent.setup()
    renderChart(data, 12, onWeeksChange)

    await user.click(screen.getByRole("button", { name: "26" }))

    expect(onWeeksChange).toHaveBeenCalledWith(26)
  })

  it("marks the active window on the toggle", () => {
    renderChart(data, 12, vi.fn())
    expect(screen.getByRole("button", { name: "12" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })
})
