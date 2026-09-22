import { describe, expect, it } from "vitest"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"

describe("needsOnboarding", () => {
  it("is true for a fresh profile", () => {
    expect(needsOnboarding({ onboardedAt: null, onboardingSkippedAt: null })).toBe(true)
  })
  it("is false once onboarded", () => {
    expect(needsOnboarding({ onboardedAt: new Date(), onboardingSkippedAt: null })).toBe(false)
  })
  it("is false once skipped", () => {
    expect(needsOnboarding({ onboardedAt: null, onboardingSkippedAt: new Date() })).toBe(false)
  })
})
