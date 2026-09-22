import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { GoalStep } from "@/features/onboarding/components/goal-step"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

describe("GoalStep", () => {
  it("calls onSelect with the chosen goal", async () => {
    const onSelect = vi.fn()
    render(<GoalStep value={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole("button", { name: /build_muscle/i }))
    expect(onSelect).toHaveBeenCalledWith("build_muscle")
  })
})
