import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import { HistoryDetail } from "@/features/history/components/history-detail"

const session = { id: "s1", userId: "u1", routineId: "r1", routineDayId: "d1", name: "Push", status: "completed" as const, startedAt: "2026-01-05T10:00:00.000Z", completedAt: "2026-01-05T11:00:00.000Z", activeSeconds: 3600, notes: null, snapshot: {}, exercises: [{ id: "se1", exerciseId: "e1", order: 0, nameSnapshot: "Squat", targetSets: 3, targetReps: "5", restSeconds: 60, timerType: "none" as const, workSeconds: null, rounds: null, completed: true, skipped: false, swappedFromId: null, notes: null, exercise: null, lastPerformance: null, sets: [{ id: "set1", setNumber: 1, type: "working" as const, reps: 5, weightKg: 100, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: "2026-01-05T10:30:00.000Z", isPr: true }] }] }

describe("HistoryDetail", () => {
  it("renders the exercise, its set, and the PR marker", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HistoryDetail session={session} /></NextIntlClientProvider>)
    expect(screen.getByText("Squat")).toBeInTheDocument()
    expect(screen.getByText("PR")).toBeInTheDocument()
  })

  it("links the exercise name to its per-exercise progress chart", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HistoryDetail session={session} /></NextIntlClientProvider>)
    expect(screen.getByRole("link", { name: "Squat" })).toHaveAttribute(
      "href",
      "/en/progress/exercise/e1",
    )
  })
})
