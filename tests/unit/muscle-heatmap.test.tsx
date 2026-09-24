import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import en from "@/i18n/messages/en.json"
import {
  MuscleHeatmap,
  type MuscleVolume,
} from "@/features/progress/components/muscle-heatmap"

function renderHeatmap(muscleVolume: MuscleVolume[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MuscleHeatmap muscleVolume={muscleVolume} />
    </NextIntlClientProvider>,
  )
}

function opacityOf(container: HTMLElement, region: string): number {
  const path = container.querySelector(`[data-region="${region}"]`)
  expect(path).not.toBeNull()
  return Number(path?.getAttribute("fill-opacity"))
}

describe("MuscleHeatmap", () => {
  it("shows the empty prompt when there is no volume", () => {
    const { container } = renderHeatmap([])
    expect(screen.getByText(en.heatmap.empty)).toBeInTheDocument()
    expect(container.querySelector("[data-region]")).toBeNull()
  })

  it("shades each region by its heat level", () => {
    const { container } = renderHeatmap([
      { muscle: "chest", volumeKg: 100 },
      { muscle: "quads", volumeKg: 50 },
    ])
    const chest = opacityOf(container, "chest")
    const quads = opacityOf(container, "quads")
    const calves = opacityOf(container, "calves")
    expect(chest).toBe(1)
    expect(quads).toBeLessThan(chest)
    expect(quads).toBeGreaterThan(calves)
  })

  it("labels each region with its name and volume and keeps it focusable", () => {
    renderHeatmap([{ muscle: "chest", volumeKg: 100 }])
    const chest = screen.getByRole("button", { name: "Chest, 100 kg" })
    expect(chest).toHaveAttribute("tabindex", "0")
  })

  it("reveals the selected region name and volume when tapped", () => {
    renderHeatmap([{ muscle: "chest", volumeKg: 100 }])
    fireEvent.click(screen.getByRole("button", { name: "Chest, 100 kg" }))
    const detail = screen.getByRole("status")
    expect(detail).toHaveTextContent("Chest")
    expect(detail).toHaveTextContent("100 kg")
  })

  it("renders the low-to-high legend", () => {
    renderHeatmap([{ muscle: "chest", volumeKg: 100 }])
    expect(screen.getByText(en.heatmap.legendLow)).toBeInTheDocument()
    expect(screen.getByText(en.heatmap.legendHigh)).toBeInTheDocument()
  })

  it("notes when custom exercises contributed", () => {
    renderHeatmap([{ muscle: "custom", volumeKg: 40 }])
    expect(screen.getByText(/Includes custom exercises/)).toBeInTheDocument()
  })
})
