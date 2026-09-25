import { describe, expect, it } from "vitest"
import { MUSCLE_TO_REGION, MUSCLE_REGIONS, creditMuscles, heatLevel } from "@/features/progress/lib/muscles"

describe("muscle mapping", () => {
  it("maps every free-exercise-db muscle name to a region", () => {
    for (const name of ["chest", "lats", "middle back", "lower back", "shoulders", "biceps", "triceps", "forearms", "abdominals", "quadriceps", "hamstrings", "glutes", "calves", "traps", "neck", "adductors", "abductors"])
      expect(MUSCLE_TO_REGION[name], name).toBeTruthy()
  })
  it("credits primary at 1.0 and secondary at 0.5", () => {
    expect(creditMuscles(["chest"], ["triceps"], 100)).toEqual({ chest: 100, triceps: 50 })
  })
  it("buckets unmapped/custom into custom", () => {
    expect(creditMuscles(["unknown-muscle"], [], 40)).toEqual({ custom: 40 })
    expect(creditMuscles([], [], 10)).toEqual({ custom: 10 })
  })
  it("computes a 0..1 heat level", () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(50, 100)).toBeCloseTo(0.5)
    expect(heatLevel(100, 0)).toBe(0)
    expect(heatLevel(200, 100)).toBe(1)
    expect(heatLevel(-5, 100)).toBe(0)
  })
  it("orders regions as declared", () => {
    expect(MUSCLE_REGIONS[0]?.id).toBe("chest")
    expect(MUSCLE_REGIONS[MUSCLE_REGIONS.length - 1]?.id).toBe("custom")
  })
  it("has unique ordered regions", () => {
    expect(new Set(MUSCLE_REGIONS.map((r) => r.id)).size).toBe(MUSCLE_REGIONS.length)
  })
})
