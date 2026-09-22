import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { saveAsync } = vi.hoisted(() => ({
  saveAsync: vi.fn(async () => undefined),
}))
vi.mock("@/features/onboarding/hooks/use-save-onboarding-step", () => ({
  useSaveOnboardingStep: () => ({ mutateAsync: saveAsync, isPending: false }),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { MetricsStep } from "@/features/onboarding/components/metrics-step"
import { useOnboardingStore } from "@/features/onboarding/stores/onboarding-store"

beforeEach(() => {
  saveAsync.mockClear()
  useOnboardingStore.getState().reset("metrics")
})

describe("MetricsStep", () => {
  it("advances without saving when skipped", async () => {
    render(<MetricsStep />)
    await userEvent.click(screen.getByRole("button", { name: /^skip$/i }))
    expect(saveAsync).not.toHaveBeenCalled()
    expect(useOnboardingStore.getState().stepIndex).toBe(6)
  })

  it("patches the entered metrics then advances", async () => {
    render(<MetricsStep />)
    await userEvent.type(screen.getByLabelText("birthYear"), "1990")
    await userEvent.type(screen.getByLabelText("height"), "180")
    await userEvent.type(screen.getByLabelText("weight"), "75")
    await userEvent.click(screen.getByRole("button", { name: /^male$/i }))
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    expect(saveAsync).toHaveBeenCalledWith({
      birthYear: 1990,
      heightCm: 180,
      weightKg: 75,
      gender: "male",
    })
    expect(useOnboardingStore.getState().stepIndex).toBe(6)
  })
})
