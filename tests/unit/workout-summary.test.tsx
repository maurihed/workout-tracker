import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextIntlClientProvider } from "next-intl"
import en from "@/i18n/messages/en.json"
import { closeDb } from "@/lib/offline/db"
import { SessionSummary } from "@/features/workouts/components/session-summary"

vi.mock("@/features/profile/hooks/use-profile", () => ({ useProfile: () => ({ data: { unitSystem: "metric" } }) }))

afterEach(async () => { await closeDb() })

describe("SessionSummary", () => {
  it("renders from a minimal local input", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SessionSummary session={{ activeSeconds: 65, exercises: [{ sets: [{ reps: 10, weightKg: 20, completedAt: "2026-01-01T00:00:00.000Z" }] }] }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText("01:05")).toBeInTheDocument()
    expect(screen.getByText("200 kg")).toBeInTheDocument()
  })
})
