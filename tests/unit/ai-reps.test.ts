import { describe, expect, it } from "vitest"
import { parseRepRange } from "@/features/ai/lib/reps"

describe("parseRepRange", () => {
  it("parses a hyphen range", () => {
    expect(parseRepRange("8-12")).toEqual({ min: 8, max: 12 })
  })
  it("parses an en-dash range with spaces", () => {
    expect(parseRepRange("8 – 12")).toEqual({ min: 8, max: 12 })
  })
  it("parses a single number", () => {
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 })
  })
  it("parses a suffixed number", () => {
    expect(parseRepRange("10 reps")).toEqual({ min: 10, max: 10 })
  })
  it("orders a reversed range", () => {
    expect(parseRepRange("12-8")).toEqual({ min: 8, max: 12 })
  })
  it("returns null when there is no number", () => {
    expect(parseRepRange("AMRAP")).toBeNull()
  })
})
