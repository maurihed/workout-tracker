import { describe, expect, it } from "vitest"
import { weekStart, weeksGoalMet } from "@/features/gamification/lib/week"

describe("weekStart", () => {
  it("returns the Monday for a Monday-start week", () => {
    // 2026-01-07 is a Wednesday.
    expect(weekStart("2026-01-07", 1)).toBe("2026-01-05")
    expect(weekStart("2026-01-05", 1)).toBe("2026-01-05")
  })
  it("respects a Sunday-start week", () => {
    expect(weekStart("2026-01-07", 0)).toBe("2026-01-04")
  })
})

describe("weeksGoalMet", () => {
  it("groups dates into weeks and returns weeks meeting the goal", () => {
    const dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-12"]
    expect(weeksGoalMet(dates, 3, 1)).toEqual(["2026-01-05"])
    expect(weeksGoalMet(dates, 1, 1)).toEqual(["2026-01-05", "2026-01-12"])
  })
})
