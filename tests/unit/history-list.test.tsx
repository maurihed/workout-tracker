import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { HistoryList } from "@/features/history/components/history-list"

vi.mock("@/features/history/hooks/use-history", () => ({ useHistory: () => ({ data: { pages: [{ items: [{ id: "s1", name: "Push", startedAt: "2026-01-05T10:00:00.000Z", completedAt: "2026-01-05T11:00:00.000Z", activeSeconds: 3600, totalVolumeKg: 200, setCount: 3, prCount: 1, routineId: "r1", routineDayId: "d1" }], nextCursor: null }] }, isLoading: false, isError: false, hasNextPage: false, fetchNextPage: vi.fn() }) }))

describe("HistoryList", () => {
  it("renders a completed session row with a PR marker", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HistoryList /></NextIntlClientProvider>)
    expect(screen.getByText("Push")).toBeInTheDocument()
    expect(screen.getByText("PR")).toBeInTheDocument()
  })
})
