import { describe, expect, it } from "vitest"
import { ACHIEVEMENTS } from "@/features/gamification/lib/achievements"
import { toAchievementRow } from "./achievements"

describe("toAchievementRow", () => {
  it("maps a definition to a seed row with all bilingual fields", () => {
    const row = toAchievementRow(ACHIEVEMENTS[0]!)
    expect(row.slug).toBe("first_workout")
    expect(row.name).toBeTruthy()
    expect(row.nameEs).toBeTruthy()
    expect(row.descriptionEs).toBeTruthy()
    expect(row.criteria).toEqual({ type: "sessions", threshold: 1 })
    expect(row.xpReward).toBe(100)
  })
})
