import { beforeEach, describe, expect, it } from "vitest"
import { useOnboardingStore } from "@/features/onboarding/stores/onboarding-store"

describe("onboarding store", () => {
  beforeEach(() => useOnboardingStore.getState().reset("goal"))

  it("tracks the current step and answers", () => {
    useOnboardingStore.getState().setAnswer("goal", "build_muscle")
    useOnboardingStore.getState().goNext()
    expect(useOnboardingStore.getState().answers.goal).toBe("build_muscle")
    expect(useOnboardingStore.getState().stepIndex).toBe(1)
  })
})
