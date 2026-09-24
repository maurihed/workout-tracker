import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { ConsistencyChart } from "@/features/progress/components/consistency-chart"
import type { WeekBucket } from "@/features/progress/lib/volume"
import en from "@/i18n/messages/en.json"

const data: WeekBucket[] = [
  { weekStart: "2026-01-05", volumeKg: 1500, sessions: 2 },
  { weekStart: "2026-01-12", volumeKg: 900.5, sessions: 1 },
]

function renderChart(volumeByWeek: WeekBucket[] = data) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConsistencyChart volumeByWeek={volumeByWeek} />
    </NextIntlClientProvider>,
  )
}

describe("ConsistencyChart", () => {
  it("renders sessions per week with data", () => {
    const { container } = renderChart()
    expect(container.querySelector(".recharts-surface")).not.toBeNull()
    expect(screen.getByText(en.analytics.consistency)).toBeInTheDocument()
    expect(screen.queryByText(en.analytics.empty)).not.toBeInTheDocument()
  })

  it("shows an empty state without data", () => {
    const { container } = renderChart([])
    expect(screen.getByText(en.analytics.empty)).toBeInTheDocument()
    expect(container.querySelector(".recharts-surface")).toBeNull()
  })
})
