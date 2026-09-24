import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

const useExerciseProgressMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/progress/hooks/use-exercise-progress", () => ({
  useExerciseProgress: useExerciseProgressMock,
}))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))
vi.mock("@/features/progress/components/chart-shell", () => ({
  ChartSkeleton: () => null,
  chartBoundary: () => () => null,
}))
vi.mock("next/navigation", () => ({
  useParams: () => ({ exerciseId: "e1" }),
}))

import ExerciseProgressPage from "@/app/[locale]/(app)/progress/exercise/[exerciseId]/page"
import en from "@/i18n/messages/en.json"

describe("ExerciseProgressPage", () => {
  it("shows the exercise name and links back to progress", () => {
    useExerciseProgressMock.mockReturnValue({
      data: {
        exerciseId: "e1",
        name: "Back Squat",
        nameEs: "Sentadilla",
        points: [
          { date: "2026-01-05", e1rm: 116.7, topWeightKg: 100, reps: 5 },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ExerciseProgressPage />
      </NextIntlClientProvider>,
    )

    expect(
      screen.getByRole("heading", { name: "Back Squat" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: en.history.title }),
    ).toHaveAttribute("href", "/en/progress")
  })
})
