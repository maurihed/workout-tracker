import { describe, expect, it } from "vitest"
import { recommendTemplates } from "@/features/onboarding/lib/recommend-templates"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"

const base = { goal: null, experience: null, location: null, daysPerWeek: null, equipment: [] }

describe("recommendTemplates", () => {
  it("returns all templates sorted by score descending", () => {
    const result = recommendTemplates({ ...base }, ROUTINE_TEMPLATES)
    expect(result).toHaveLength(ROUTINE_TEMPLATES.length)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score)
    }
  })

  it("scores a home bodyweight-friendly user toward bodyweight/dumbbell templates", () => {
    const result = recommendTemplates(
      { goal: "endurance", experience: "beginner", location: "home", daysPerWeek: 3, equipment: ["body only"] },
      ROUTINE_TEMPLATES,
    )
    expect(result[0]!.template.slug).toBe("bodyweight-3x")
    expect(result[0]!.recommended).toBe(true)
  })

  it("scores a gym intermediate toward gym templates and flags at most 3 recommended", () => {
    const result = recommendTemplates(
      { goal: "build_muscle", experience: "intermediate", location: "gym", daysPerWeek: 4, equipment: ["barbell", "dumbbell", "machine", "body only"] },
      ROUTINE_TEMPLATES,
    )
    expect(result[0]!.template.slug).toBe("upper-lower-4x")
    expect(result.filter((r) => r.recommended).length).toBeLessThanOrEqual(3)
  })

  it("is deterministic for ties (stable template order)", () => {
    const a = recommendTemplates({ ...base }, ROUTINE_TEMPLATES).map((r) => r.template.slug)
    const b = recommendTemplates({ ...base }, ROUTINE_TEMPLATES).map((r) => r.template.slug)
    expect(a).toEqual(b)
  })
})
