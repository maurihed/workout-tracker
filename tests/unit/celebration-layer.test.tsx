import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { CelebrationLayer } from "@/features/gamification/components/celebration-layer"

vi.mock("@/features/gamification/hooks/use-stats", () => ({ useStats: () => ({ data: { xp: 500, level: 3, levelProgress: 0.1, xpToNextLevel: 900, currentStreak: 1, longestStreak: 1, lastHitDate: null, streakFreezes: 2, totalSessions: 5, totalVolumeKg: 0, weeklyGoal: { target: 3, completed: 1, weekStart: "2026-01-05" } }, isLoading: false, isError: false }) }))
vi.mock("@/features/gamification/hooks/use-achievements", () => ({ useAchievements: () => ({ data: { achievements: [{ id: "a1", slug: "first_workout", name: "First Workout", nameEs: "Primero", description: "d", descriptionEs: "d", icon: "barbell", xpReward: 100 }], unlocked: [{ achievementId: "a1", unlockedAt: new Date().toISOString() }] }, isLoading: false, isError: false }) }))

beforeEach(() => localStorage.clear())

describe("CelebrationLayer", () => {
  it("shows the badge modal for an achievement unlocked after the last celebration", async () => {
    localStorage.setItem(
      "gym.lastCelebratedAt",
      new Date(Date.now() - 60_000).toISOString(),
    )
    render(<NextIntlClientProvider locale="en" messages={en}><CelebrationLayer /></NextIntlClientProvider>)
    expect(await screen.findByText(/Badge unlocked/i)).toBeInTheDocument()
    expect(screen.getByText("First Workout")).toBeInTheDocument()
  })

  it("does not celebrate pre-existing badges on first load", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><CelebrationLayer /></NextIntlClientProvider>)
    expect(screen.queryByText(/Badge unlocked/i)).not.toBeInTheDocument()
  })
})
