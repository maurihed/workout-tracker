import { describe, expect, it } from "vitest"
import { firstIncompleteStep } from "@/features/onboarding/lib/steps"

const empty = { goal: null, experience: null, location: null, equipment: [], daysPerWeek: null, unitSystem: "metric", timezone: "UTC", birthYear: null, heightCm: null, weightKg: null, gender: null } as const

describe("firstIncompleteStep", () => {
  it("starts at goal for an empty profile", () => {
    expect(firstIncompleteStep({ ...empty })).toBe("goal")
  })
  it("advances past completed required steps", () => {
    expect(firstIncompleteStep({ ...empty, goal: "build_muscle", experience: "beginner" })).toBe("equipment")
  })
  it("skips the optional metrics step", () => {
    const p = { ...empty, goal: "build_muscle", experience: "beginner", location: "gym", equipment: ["barbell"], daysPerWeek: 4 }
    expect(firstIncompleteStep(p)).toBe("template")
  })
})
