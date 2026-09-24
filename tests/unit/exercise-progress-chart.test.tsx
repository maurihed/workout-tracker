import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { ExerciseProgressChart } from "@/features/progress/components/exercise-progress-chart"
import type { SeriesPoint } from "@/features/progress/lib/one-rm"
import en from "@/i18n/messages/en.json"

const points: SeriesPoint[] = [
  { date: "2026-01-05", e1rm: 116.67, topWeightKg: 100, reps: 5 },
  { date: "2026-01-12", e1rm: 121, topWeightKg: 110, reps: 3 },
]

function renderChart(data: SeriesPoint[] = points) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ExerciseProgressChart points={data} />
    </NextIntlClientProvider>,
  )
}

describe("ExerciseProgressChart", () => {
  it("renders an estimated-1RM point per session", () => {
    const { container } = renderChart()
    expect(container.querySelector(".recharts-surface")).not.toBeNull()
    expect(screen.getByText("116.7 kg")).toBeInTheDocument()
    expect(screen.getByText("121 kg")).toBeInTheDocument()
    expect(screen.queryByText(en.analytics.empty)).not.toBeInTheDocument()
  })

  it("renders the top set for each point", () => {
    renderChart()
    expect(screen.getByText("5 × 100 kg")).toBeInTheDocument()
    expect(screen.getByText("3 × 110 kg")).toBeInTheDocument()
  })

  it("shows an empty state without points", () => {
    const { container } = renderChart([])
    expect(screen.getByText(en.analytics.empty)).toBeInTheDocument()
    expect(container.querySelector(".recharts-surface")).toBeNull()
  })
})
