import { describe, expect, it } from "vitest"
import { ACHIEVEMENTS, evaluateAchievements } from "@/features/gamification/lib/achievements"

const base = { totalSessions: 0, longestStreak: 0, totalVolumeKg: 0, prCount: 0, weeksGoalMet: 0 }

describe("achievements", () => {
  it("has 10 unique bilingual badges", () => {
    expect(ACHIEVEMENTS).toHaveLength(10)
    expect(new Set(ACHIEVEMENTS.map((a) => a.slug)).size).toBe(10)
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.nameEs.length).toBeGreaterThan(0)
      expect(a.description.length).toBeGreaterThan(0)
      expect(a.descriptionEs.length).toBeGreaterThan(0)
      expect(a.xpReward).toBeGreaterThan(0)
    }
  })

  it("unlocks nothing at zero", () => {
    expect(evaluateAchievements(base)).toEqual([])
  })

  it("unlocks by each criterion type", () => {
    expect(evaluateAchievements({ ...base, totalSessions: 1 })).toContain("first_workout")
    expect(evaluateAchievements({ ...base, totalSessions: 10 })).toContain("sessions_10")
    expect(evaluateAchievements({ ...base, longestStreak: 7 })).toContain("streak_7")
    expect(evaluateAchievements({ ...base, totalVolumeKg: 100_000 })).toContain("volume_100k")
    expect(evaluateAchievements({ ...base, prCount: 1 })).toContain("first_pr")
    expect(evaluateAchievements({ ...base, weeksGoalMet: 4 })).toContain("weekly_goal_4")
  })
})
