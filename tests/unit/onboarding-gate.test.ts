import { describe, expect, it } from "vitest"
import {
  isOnboardingComplete,
  needsOnboarding,
  shouldLeaveOnboarding,
} from "@/features/onboarding/lib/onboarding"

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

describe("isOnboardingComplete", () => {
  it("is false for a skipped-but-not-completed profile", () => {
    expect(
      isOnboardingComplete({ onboardedAt: null, onboardingSkippedAt: new Date() }),
    ).toBe(false)
  })
  it("is true only once onboardedAt is set", () => {
    expect(
      isOnboardingComplete({ onboardedAt: new Date(), onboardingSkippedAt: null }),
    ).toBe(true)
  })
})

describe("shouldLeaveOnboarding", () => {
  it("admits a skipped user back into onboarding", () => {
    expect(
      shouldLeaveOnboarding({ onboardedAt: null, onboardingSkippedAt: new Date() }),
    ).toBe(false)
  })
  it("admits a fresh user", () => {
    expect(
      shouldLeaveOnboarding({ onboardedAt: null, onboardingSkippedAt: null }),
    ).toBe(false)
  })
  it("admits a user with no profile row", () => {
    expect(shouldLeaveOnboarding(null)).toBe(false)
  })
  it("redirects a completed user out", () => {
    expect(
      shouldLeaveOnboarding({ onboardedAt: new Date(), onboardingSkippedAt: null }),
    ).toBe(true)
  })
})
