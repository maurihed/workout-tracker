import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { StatsHeader } from "@/features/gamification/components/stats-header"

vi.mock("@/features/gamification/hooks/use-stats", () => ({ useStats: () => ({ data: { currentStreak: 3, longestStreak: 5, lastHitDate: "2026-01-07", streakFreezes: 2, totalSessions: 4, totalVolumeKg: 1234, xp: 250, level: 2, xpToNextLevel: 150, levelProgress: 0.5, weeklyGoal: { target: 3, completed: 2, weekStart: "2026-01-05" } }, isLoading: false, isError: false }) }))
vi.mock("@/features/gamification/hooks/use-achievements", () => ({ useAchievements: () => ({ data: { achievements: [], unlocked: [] }, isLoading: false, isError: false }) }))

describe("StatsHeader", () => {
  it("shows streak, level, and weekly goal", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><StatsHeader /></NextIntlClientProvider>)
    expect(screen.getByText(/3-day streak/)).toBeInTheDocument()
    expect(screen.getByText(/Level 2/)).toBeInTheDocument()
    expect(screen.getByText(/2 of 3 this week/)).toBeInTheDocument()
  })
})
