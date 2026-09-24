import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/history/components/history-list", () => ({
  HistoryList: () => <div data-testid="history-list" />,
}))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))

import ProgressPage from "@/app/[locale]/(app)/progress/page"
import en from "@/i18n/messages/en.json"

describe("ProgressPage", () => {
  it("links to the body-metrics page", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProgressPage />
      </NextIntlClientProvider>,
    )

    expect(screen.getByTestId("history-list")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: en.metrics.title }),
    ).toHaveAttribute("href", "/en/progress/metrics")
  })
})
