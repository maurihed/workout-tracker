import { describe, expect, it } from "vitest"
import { levelForXp, levelProgress, xpForLevel, xpToNextLevel } from "@/features/gamification/lib/level"
import { XP_AWARDS, STREAK_MILESTONES } from "@/features/gamification/lib/xp"

describe("level curve", () => {
  it("maps cumulative XP to levels", () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(400)).toBe(3)
    expect(levelForXp(900)).toBe(4)
  })
  it("is the inverse of xpForLevel at thresholds", () => {
    for (const level of [1, 2, 3, 5, 10]) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1 || 1)
    }
  })
  it("reports XP to the next level and progress within the level", () => {
    expect(xpToNextLevel(0)).toBe(100)
    expect(xpToNextLevel(150)).toBe(250)
    expect(levelProgress(0)).toBe(0)
    expect(levelProgress(250)).toBeCloseTo(0.5)
    expect(levelProgress(100)).toBe(0)
  })
  it("guards negative XP", () => {
    expect(levelForXp(-50)).toBe(1)
    expect(levelProgress(-50)).toBe(0)
  })
  it("defines the award table", () => {
    expect(XP_AWARDS.session).toBe(100)
    expect(XP_AWARDS.weeklyGoal).toBe(150)
    expect(XP_AWARDS.pr).toBe(50)
    expect(STREAK_MILESTONES).toEqual([7, 30, 100])
    expect(XP_AWARDS.streakMilestones[7]).toBe(100)
    expect(XP_AWARDS.streakMilestones[30]).toBe(500)
    expect(XP_AWARDS.streakMilestones[100]).toBe(2000)
  })
})
