import { describe, expect, it } from "vitest"
import { epley1rm, selectPrSet } from "@/features/gamification/lib/pr"

describe("epley 1RM", () => {
  it("computes weight * (1 + reps/30)", () => {
    expect(epley1rm(100, 1)).toBeCloseTo(103.333, 2)
    expect(epley1rm(80, 10)).toBeCloseTo(106.667, 2)
  })
  it("returns null for missing or non-positive inputs", () => {
    expect(epley1rm(null, 10)).toBeNull()
    expect(epley1rm(50, null)).toBeNull()
    expect(epley1rm(0, 10)).toBeNull()
    expect(epley1rm(50, 0)).toBeNull()
  })
})

describe("selectPrSet", () => {
  const sets = [
    { id: "a", reps: 10, weightKg: 60 },
    { id: "b", reps: 5, weightKg: 80 },
    { id: "c", reps: 3, weightKg: 90 },
  ]
  it("returns the single best set when it beats the prior best", () => {
    expect(selectPrSet(sets, 100)).toBeNull() // 90*(1+3/30)=99 < 100 → none
    expect(selectPrSet(sets, 95)).toBe("c") // 99 > 95
  })
  it("treats the first-ever set as a PR", () => {
    expect(selectPrSet(sets, null)).toBe("c")
  })
  it("ignores sets without a usable 1RM", () => {
    expect(selectPrSet([{ id: "x", reps: null, weightKg: null }], 10)).toBeNull()
  })
})
