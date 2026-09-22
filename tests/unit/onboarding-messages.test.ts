import { describe, expect, it } from "vitest"

import { EQUIPMENT } from "@/features/exercises/schemas/exercise"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

describe("onboarding copy", () => {
  it("has onboarding and dashboard namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.onboarding).toBeTruthy()
      expect(m.dashboard).toBeTruthy()
      expect(m.onboarding.goals.build_muscle.length).toBeGreaterThan(0)
      expect(m.dashboard.startWorkout.length).toBeGreaterThan(0)
    }
  })

  it("localizes every gender option in both locales", () => {
    const genders = ["male", "female", "other", "prefer_not_to_say"] as const
    for (const m of [en, es]) {
      for (const gender of genders) {
        expect(nonEmpty(m.onboarding.metrics[gender])).toBe(true)
      }
    }
  })

  it("localizes every equipment catalog value in both locales", () => {
    for (const m of [en, es]) {
      const items = m.onboarding.equipment.items as Record<
        string,
        string | undefined
      >
      for (const item of EQUIPMENT) {
        expect(nonEmpty(items[item])).toBe(true)
      }
    }
  })
})
