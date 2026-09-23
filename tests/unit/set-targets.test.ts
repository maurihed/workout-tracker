import { describe, expect, it } from "vitest"
import {
  legacyTargetsToSetTargets,
  normalizeRoutineSetTargets,
  parseSetTargets,
  syncSetTargets,
} from "@/features/routines/lib/set-targets"

describe("parseSetTargets", () => {
  it("returns null for null, undefined and non-arrays", () => {
    expect(parseSetTargets(null)).toBeNull()
    expect(parseSetTargets(undefined)).toBeNull()
    expect(parseSetTargets({ reps: 10 })).toBeNull()
    expect(parseSetTargets("nope")).toBeNull()
  })

  it("parses a valid array", () => {
    expect(parseSetTargets([{ reps: 10, weightKg: 40, rpe: 8 }])).toEqual([
      { reps: 10, weightKg: 40, rpe: 8 },
    ])
  })

  it("returns null for malformed entries", () => {
    expect(parseSetTargets([{ reps: "ten" }])).toBeNull()
    expect(parseSetTargets([{ reps: 10, rpe: 11 }])).toBeNull()
    expect(parseSetTargets([])).toBeNull()
  })
})

describe("legacyTargetsToSetTargets", () => {
  it("repeats the legacy prescription across every set", () => {
    expect(legacyTargetsToSetTargets(3, "10", 40)).toEqual([
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("keeps ranges as null reps and never returns zero rows", () => {
    expect(legacyTargetsToSetTargets(2, "8-12", null)[0]).toEqual({
      reps: null,
      weightKg: null,
      rpe: null,
    })
    expect(legacyTargetsToSetTargets(0, "10", null)).toHaveLength(1)
  })

  it("nulls reps outside the schema bounds", () => {
    expect(legacyTargetsToSetTargets(1, "150", null)[0]).toEqual({
      reps: null,
      weightKg: null,
      rpe: null,
    })
    expect(legacyTargetsToSetTargets(1, "0", null)[0]!.reps).toBeNull()
  })
})

describe("syncSetTargets", () => {
  it("derives targetSets, targetReps and targetWeightKg from the rows", () => {
    const next = [
      { reps: 12, weightKg: 40, rpe: 7 },
      { reps: 8, weightKg: 50, rpe: 9 },
    ]
    expect(syncSetTargets(next)).toEqual({
      setTargets: next,
      targetSets: 2,
      targetReps: "12",
      targetWeightKg: 40,
    })
  })

  it("uses an empty string when the first set has no reps", () => {
    expect(syncSetTargets([{ reps: null, weightKg: null, rpe: null }]).targetReps).toBe("")
  })
})

describe("normalizeRoutineSetTargets", () => {
  it("parses raw json per exercise and leaves malformed as null", () => {
    const routine = {
      days: [
        {
          exercises: [
            { setTargets: [{ reps: 10, weightKg: 40, rpe: 8 }] },
            { setTargets: "garbage" },
          ],
        },
      ],
    }
    const out = normalizeRoutineSetTargets(routine)
    expect(out.days[0]!.exercises[0]!.setTargets).toEqual([
      { reps: 10, weightKg: 40, rpe: 8 },
    ])
    expect(out.days[0]!.exercises[1]!.setTargets).toBeNull()
  })
})
