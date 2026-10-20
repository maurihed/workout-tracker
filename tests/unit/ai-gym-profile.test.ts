import { describe, expect, it } from "vitest"

import type { AiJobInput } from "@/features/ai/lib/contract"
import {
  allowedEquipmentForGymProfile,
  allowedEquipmentForInput,
  equipmentForInput,
  filterCatalogEntriesForInput,
} from "@/features/ai/lib/gym-profile"

function input(overrides: Partial<AiJobInput> = {}): AiJobInput {
  return {
    goal: "build_muscle",
    experience: "intermediate",
    location: "gym",
    equipment: [],
    gymProfile: "intermediate",
    daysPerWeek: 3,
    focus: null,
    personalize: true,
    ...overrides,
  }
}

describe("gym profile equipment", () => {
  it("limits a basic gym to free weights and bodyweight", () => {
    const allowed = allowedEquipmentForGymProfile("basic")
    expect(allowed.has("barbell")).toBe(true)
    expect(allowed.has("dumbbell")).toBe(true)
    expect(allowed.has("machine")).toBe(false)
    expect(allowed.has("cable")).toBe(false)
    expect(allowed.has("e-z curl bar")).toBe(false)
    expect(allowed.has("other")).toBe(false)
  })

  it("gives an intermediate gym cables and standard machines", () => {
    const allowed = allowedEquipmentForGymProfile("intermediate")
    expect(allowed.has("machine")).toBe(true)
    expect(allowed.has("cable")).toBe(true)
    expect(allowed.has("e-z curl bar")).toBe(true)
    expect(allowed.has("other")).toBe(false)
  })

  it("lets a fully equipped gym use every catalog equipment value", () => {
    const allowed = allowedEquipmentForGymProfile("fully_equipped")
    expect(allowed.has("other")).toBe(true)
    expect(allowed.has("machine")).toBe(true)
    expect(allowed.has("barbell")).toBe(true)
  })

  it("uses the selected equipment plus bodyweight at home", () => {
    const allowed = allowedEquipmentForInput(
      input({ location: "home", equipment: ["dumbbell", "bands"] }),
    )
    expect(allowed.has("dumbbell")).toBe(true)
    expect(allowed.has("bands")).toBe(true)
    expect(allowed.has("body only")).toBe(true)
    expect(allowed.has("machine")).toBe(false)
  })

  it("falls back to bodyweight only at home with no equipment", () => {
    expect([
      ...allowedEquipmentForInput(input({ location: "home", equipment: [] })),
    ]).toEqual(["body only"])
    expect(
      equipmentForInput(input({ location: "home", equipment: [] })),
    ).toEqual(["body only"])
  })

  it("filters catalog entries by the allowed equipment", () => {
    const entries = [
      { sourceId: "squat", equipment: "barbell" },
      { sourceId: "pushup", equipment: "body only" },
      { sourceId: "pulldown", equipment: "cable" },
      { sourceId: "sled", equipment: "other" },
    ]

    expect(
      filterCatalogEntriesForInput(entries, input({ gymProfile: "basic" })).map(
        (entry) => entry.sourceId,
      ),
    ).toEqual(["squat", "pushup"])

    expect(
      filterCatalogEntriesForInput(
        entries,
        input({ gymProfile: "fully_equipped" }),
      ).map((entry) => entry.sourceId),
    ).toEqual(["squat", "pushup", "pulldown", "sled"])
  })
})
