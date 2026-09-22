import { describe, expect, it } from "vitest"
import { updateProfileSchema } from "@/features/profile/schemas/profile"

describe("updateProfileSchema", () => {
  it("accepts a valid IANA timezone", () => {
    expect(updateProfileSchema.safeParse({ timezone: "America/Mexico_City" }).success).toBe(true)
  })

  it("rejects a non-IANA timezone", () => {
    const result = updateProfileSchema.safeParse({ timezone: "Mars/Phobos" })
    expect(result.success).toBe(false)
  })

  it("rejects an out-of-range week start", () => {
    expect(updateProfileSchema.safeParse({ weekStartsOn: 9 }).success).toBe(false)
  })

  it("accepts an empty partial update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true)
  })
})

describe("onboarding profile fields", () => {
  it("accepts a valid location and equipment subset", () => {
    expect(
      updateProfileSchema.safeParse({ location: "home", equipment: ["dumbbell", "body only"] })
        .success,
    ).toBe(true)
  })

  it("rejects an unknown location", () => {
    expect(updateProfileSchema.safeParse({ location: "moon" }).success).toBe(false)
  })

  it("rejects an equipment value outside the catalog set", () => {
    expect(updateProfileSchema.safeParse({ equipment: ["jetpack"] }).success).toBe(false)
  })

  it("accepts onboardingSkippedAt as an ISO datetime", () => {
    expect(
      updateProfileSchema.safeParse({ onboardingSkippedAt: new Date().toISOString() }).success,
    ).toBe(true)
  })
})
