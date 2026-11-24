import { describe, expect, it } from "vitest"

import {
  DEFAULT_ROUTINE_REPS,
  DEFAULT_ROUTINE_SETS,
  hasPrescription,
  withDefaultPrescription,
} from "@/features/routines/lib/prescription"

describe("hasPrescription", () => {
  it("accepts a legacy series/reps prescription", () => {
    expect(
      hasPrescription({ targetSets: 3, targetReps: "10", targetWeightKg: null }),
    ).toBe(true)
  })

  it("accepts per-set reps even without a legacy target", () => {
    expect(
      hasPrescription({
        targetSets: 2,
        targetReps: "",
        targetWeightKg: null,
        setTargets: [{ reps: 8, weightKg: null, rpe: null }],
      }),
    ).toBe(true)
  })

  it("rejects an empty or zero-set prescription", () => {
    expect(
      hasPrescription({ targetSets: 3, targetReps: "", targetWeightKg: null }),
    ).toBe(false)
    expect(
      hasPrescription({
        targetSets: 0,
        targetReps: "10",
        targetWeightKg: null,
      }),
    ).toBe(false)
    expect(
      hasPrescription({
        targetSets: 3,
        targetReps: "",
        targetWeightKg: null,
        setTargets: [{ reps: null, weightKg: null, rpe: null }],
      }),
    ).toBe(false)
  })
})

describe("withDefaultPrescription", () => {
  it("fills 3 × 10 when the prescription is empty", () => {
    const exercise = {
      targetSets: 0,
      targetReps: "",
      targetWeightKg: 40,
      setTargets: null,
    }

    const filled = withDefaultPrescription(exercise)

    expect(filled.targetSets).toBe(DEFAULT_ROUTINE_SETS)
    expect(filled.targetReps).toBe(DEFAULT_ROUTINE_REPS)
    expect(filled.setTargets).toEqual([
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("leaves an existing prescription untouched", () => {
    const exercise = {
      targetSets: 4,
      targetReps: "8-12",
      targetWeightKg: null,
      setTargets: null,
    }

    expect(withDefaultPrescription(exercise)).toBe(exercise)
  })
})
