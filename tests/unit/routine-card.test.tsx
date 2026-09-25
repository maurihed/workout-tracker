import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))

import { RoutineCard } from "@/features/routines/components/routine-card"
import type { RoutineSummary } from "@/features/routines/hooks/use-routines"

const routine: RoutineSummary = {
  id: "r1",
  name: "Push Day",
  description: null,
  source: "manual",
  isActive: false,
  dayCount: 3,
  exerciseCount: 12,
  updatedAt: new Date().toISOString(),
}

describe("RoutineCard", () => {
  it("shows the name and counts, and fires actions", async () => {
    const onActivate = vi.fn()
    render(
      <RoutineCard
        routine={routine}
        onActivate={onActivate}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText("Push Day")).toBeInTheDocument()
    expect(screen.getByText("3 dayCount")).toBeInTheDocument()
    expect(screen.getByText("12 exerciseCount")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /activate/i }))
    expect(onActivate).toHaveBeenCalledWith("r1")
  })

  it("shows the active badge and disables activate when already active", () => {
    render(
      <RoutineCard
        routine={{ ...routine, isActive: true }}
        onActivate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText("active")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /activate/i })).toBeDisabled()
  })

  it("marks ai-generated routines", () => {
    const { rerender } = render(
      <RoutineCard
        routine={{ ...routine, source: "ai" }}
        onActivate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText("fromAi")).toBeInTheDocument()

    rerender(
      <RoutineCard
        routine={{ ...routine, source: "manual" }}
        onActivate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.queryByText("fromAi")).not.toBeInTheDocument()
  })

  it("fires duplicate", async () => {
    const onDuplicate = vi.fn()
    render(
      <RoutineCard
        routine={routine}
        onActivate={vi.fn()}
        onDuplicate={onDuplicate}
        onDelete={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /duplicate/i }))
    expect(onDuplicate).toHaveBeenCalledWith("r1")
  })

  it("confirms before deleting", async () => {
    const onDelete = vi.fn()
    render(
      <RoutineCard
        routine={routine}
        onActivate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
    const dialog = screen.getByRole("alertdialog")
    await userEvent.click(within(dialog).getByRole("button", { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith("r1")
  })

  it("links the card body to the routine editor", () => {
    render(
      <RoutineCard
        routine={routine}
        onActivate={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole("link", { name: /push day/i })).toHaveAttribute(
      "href",
      "/en/routines/r1",
    )
  })
})
