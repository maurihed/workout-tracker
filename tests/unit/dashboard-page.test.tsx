import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const useActiveRoutineMock = vi.hoisted(() => vi.fn())
const useAnalyticsOverviewMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/routines/hooks/use-active-routine", () => ({
  useActiveRoutine: useActiveRoutineMock,
}))
vi.mock("@/features/gamification/hooks/use-stats", () => ({
  useStats: () => ({
    data: {
      currentStreak: 0,
      longestStreak: 0,
      lastHitDate: null,
      streakFreezes: 0,
      totalSessions: 0,
      totalVolumeKg: 0,
      xp: 0,
      level: 1,
      xpToNextLevel: 100,
      levelProgress: 0,
      weeklyGoal: { target: 3, completed: 0, weekStart: "2026-01-05" },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
vi.mock("@/features/gamification/hooks/use-achievements", () => ({
  useAchievements: () => ({
    data: { achievements: [], unlocked: [] },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock("@/features/progress/hooks/use-analytics-overview", () => ({
  useAnalyticsOverview: useAnalyticsOverviewMock,
}))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))

import DashboardPage from "@/app/[locale]/(app)/dashboard/page"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1",
  name: "Full Body 3x",
  nameEs: null,
  description: null,
  descriptionEs: null,
  goal: "general_fitness",
  source: "template",
  isActive: true,
  days: [
    {
      id: "d1",
      weekday: 1,
      label: "Full Body A",
      order: 0,
      exercises: [
        {
          id: "e1",
          order: 0,
          exerciseId: "x1",
          customName: null,
          targetSets: 3,
          targetReps: "8-12",
          restSeconds: 90,
          targetWeightKg: null,
          setTargets: null,
          timerType: "none",
          workSeconds: null,
          rounds: null,
          notes: null,
          exercise: {
            id: "x1",
            name: "Barbell Squat",
            nameEs: null,
            images: [],
          },
        },
      ],
    },
  ],
}

function emptyAnalytics() {
  return {
    data: { volumeByWeek: [], muscleVolume: [], recentPrs: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
}

beforeEach(() => {
  useActiveRoutineMock.mockReset()
  useAnalyticsOverviewMock.mockReset()
  useAnalyticsOverviewMock.mockReturnValue(emptyAnalytics())
})

describe("DashboardPage", () => {
  it("shows a loading skeleton while the routine is pending", () => {
    useActiveRoutineMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("renders the active routine when one exists", () => {
    useActiveRoutineMock.mockReturnValue({
      data: routine,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(screen.getByText("Full Body 3x")).toBeInTheDocument()
  })

  it("points a user with no routine at onboarding", () => {
    useActiveRoutineMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(screen.getByRole("link", { name: "pickRoutine" })).toHaveAttribute(
      "href",
      "/en/onboarding",
    )
  })

  it("does not present the empty state when the routine query fails", () => {
    useActiveRoutineMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(screen.queryByText("pickRoutine")).not.toBeInTheDocument()
  })

  it("prompts to log a workout when there is no analytics data", () => {
    useActiveRoutineMock.mockReturnValue({
      data: routine,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(screen.getByText("empty")).toBeInTheDocument()
  })

  it("mounts the analytics section when data exists", async () => {
    useActiveRoutineMock.mockReturnValue({
      data: routine,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    useAnalyticsOverviewMock.mockReturnValue({
      data: {
        volumeByWeek: [
          { weekStart: "2026-01-05", volumeKg: 1200, sessions: 2 },
        ],
        muscleVolume: [{ muscle: "chest", volumeKg: 800 }],
        recentPrs: [
          {
            sessionId: "s1",
            date: "2026-01-05",
            exerciseId: "e1",
            name: "Back Squat",
            nameEs: null,
            weightKg: 100,
            reps: 5,
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    render(<DashboardPage />)
    expect(await screen.findByText("volume")).toBeInTheDocument()
    expect(screen.getByText("recentPrs")).toBeInTheDocument()
  })
})
