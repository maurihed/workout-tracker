import { describe, expect, it } from "vitest"

import { parsePrescribedReps, parseRepRange } from "@/lib/reps"

describe("parseRepRange", () => {
  it("parses single values, ranges, and reversed ranges", () => {
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 })
    expect(parseRepRange("8-12")).toEqual({ min: 8, max: 12 })
    expect(parseRepRange("8 – 12")).toEqual({ min: 8, max: 12 })
    expect(parseRepRange("12-8")).toEqual({ min: 8, max: 12 })
    expect(parseRepRange("10 reps")).toEqual({ min: 10, max: 10 })
  })

  it("returns null without numbers", () => {
    expect(parseRepRange("AMRAP")).toBeNull()
    expect(parseRepRange("max reps")).toBeNull()
  })
})

describe("parsePrescribedReps", () => {
  it("autofills the low end of a rep range", () => {
    expect(parsePrescribedReps("10")).toBe(10)
    expect(parsePrescribedReps("8-12")).toBe(8)
    expect(parsePrescribedReps(" 12-8 reps ")).toBe(8)
    expect(parsePrescribedReps("8-12 reps in 60s")).toBe(8)
  })

  it("leaves timed work for the interval timer", () => {
    expect(parsePrescribedReps("30s")).toBeNull()
    expect(parsePrescribedReps("45 seconds")).toBeNull()
    expect(parsePrescribedReps("10 min")).toBeNull()
  })

  it("returns null for unparseable or empty prescriptions", () => {
    expect(parsePrescribedReps("AMRAP")).toBeNull()
    expect(parsePrescribedReps("")).toBeNull()
    expect(parsePrescribedReps(null)).toBeNull()
    expect(parsePrescribedReps(undefined)).toBeNull()
  })
})
