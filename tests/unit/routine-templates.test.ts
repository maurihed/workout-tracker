import { describe, expect, it } from "vitest"
import { ROUTINE_TEMPLATES, getTemplateBySlug } from "@/features/onboarding/templates/routine-templates"

describe("ROUTINE_TEMPLATES", () => {
  it("has 5 templates with unique slugs", () => {
    expect(ROUTINE_TEMPLATES).toHaveLength(5)
    expect(new Set(ROUTINE_TEMPLATES.map((t) => t.slug)).size).toBe(5)
  })

  it("each template is internally consistent", () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.days.length).toBe(t.daysPerWeek)
      expect(new Set(t.days.map((d) => d.weekday)).size).toBe(t.days.length)
      for (const d of t.days) {
        expect(d.weekday).toBeGreaterThanOrEqual(0)
        expect(d.weekday).toBeLessThanOrEqual(6)
        expect(d.exercises.length).toBeGreaterThan(0)
        for (const e of d.exercises) {
          expect(e.sourceId.length).toBeGreaterThan(0)
          expect(e.sets).toBeGreaterThan(0)
          expect(e.reps.length).toBeGreaterThan(0)
          expect(e.restSeconds).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it("uses the ruled weekday schedules", () => {
    const bySlug = Object.fromEntries(
      ROUTINE_TEMPLATES.map((t) => [t.slug, t.days.map((d) => d.weekday)]),
    )
    expect(bySlug["full-body-3x"]).toEqual([1, 3, 5])
    expect(bySlug["upper-lower-4x"]).toEqual([1, 2, 4, 5])
    expect(bySlug["ppl-6x"]).toEqual([1, 2, 3, 4, 5, 6])
    expect(bySlug["dumbbell-home-3x"]).toEqual([1, 3, 5])
    expect(bySlug["bodyweight-3x"]).toEqual([1, 3, 5])
  })

  it("getTemplateBySlug finds a template and returns undefined otherwise", () => {
    expect(getTemplateBySlug("full-body-3x")?.slug).toBe("full-body-3x")
    expect(getTemplateBySlug("nope")).toBeUndefined()
  })
})
