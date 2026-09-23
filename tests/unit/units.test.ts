import { describe, expect, it } from "vitest"
import {
  displayWeight,
  formatWeight,
  kgToLb,
  lbToKg,
  parseWeightToKg,
} from "@/features/workouts/lib/units"

describe("units", () => {
  it("round-trips kg→lb→kg", () => {
    for (const kg of [0, 2.5, 20, 40, 102.5]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 5)
    }
  })
  it("converts with one-decimal display", () => {
    expect(displayWeight(100, "imperial")).toBe(220.5)
    expect(displayWeight(100, "metric")).toBe(100)
  })
  it("parses a displayed value back to kg", () => {
    expect(parseWeightToKg(220.5, "imperial")).toBeCloseTo(100, 3)
    expect(parseWeightToKg(40, "metric")).toBe(40)
  })
  it("formats with the unit label", () => {
    expect(formatWeight(100, "imperial")).toMatch(/220\.5\s*lb/i)
    expect(formatWeight(100, "metric")).toMatch(/100\s*kg/i)
  })
})
