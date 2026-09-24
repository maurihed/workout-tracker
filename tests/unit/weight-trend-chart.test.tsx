import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import type { BodyMetricDTO } from "@/features/profile/schemas/body-metric"
import { WeightTrendChart } from "@/features/progress/components/weight-trend-chart"
import en from "@/i18n/messages/en.json"

const entries: BodyMetricDTO[] = [
  {
    id: "m1",
    recordedOn: "2026-01-05T00:00:00.000Z",
    weightKg: 80,
    bodyFatPct: 18,
  },
  {
    id: "m2",
    recordedOn: "2026-01-12T00:00:00.000Z",
    weightKg: 79.5,
    bodyFatPct: null,
  },
  {
    id: "m3",
    recordedOn: "2026-01-19T00:00:00.000Z",
    weightKg: null,
    bodyFatPct: 17,
  },
]

function renderChart(data: BodyMetricDTO[] = entries) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WeightTrendChart entries={data} />
    </NextIntlClientProvider>,
  )
}

describe("WeightTrendChart", () => {
  it("renders a weight point per entry that has a weight", () => {
    const { container } = renderChart()
    expect(container.querySelector(".recharts-surface")).not.toBeNull()
    expect(screen.getByText("80 kg")).toBeInTheDocument()
    expect(screen.getByText("79.5 kg")).toBeInTheDocument()
  })

  it("shows an empty state without weights", () => {
    const { container } = renderChart([
      {
        id: "m1",
        recordedOn: "2026-01-05T00:00:00.000Z",
        weightKg: null,
        bodyFatPct: 18,
      },
    ])
    expect(screen.getByText(en.metrics.empty)).toBeInTheDocument()
    expect(container.querySelector(".recharts-surface")).toBeNull()
  })
})
