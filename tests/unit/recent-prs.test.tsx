import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { RecentPrs } from "@/features/progress/components/recent-prs"
import type { PrItemDTO } from "@/server/services/progress.service"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

const items: PrItemDTO[] = [
  {
    sessionId: "s2",
    date: "2026-01-12",
    exerciseId: "e1",
    name: "Back Squat",
    nameEs: "Sentadilla",
    weightKg: 110,
    reps: 3,
  },
  {
    sessionId: "s1",
    date: "2026-01-05",
    exerciseId: "e2",
    name: "Bench Press",
    nameEs: null,
    weightKg: 80,
    reps: 5,
  },
]

describe("RecentPrs", () => {
  it("lists each PR linking to its per-exercise chart", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RecentPrs items={items} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText(en.pr.recentPrs)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Back Squat/ })).toHaveAttribute(
      "href",
      "/en/progress/exercise/e1",
    )
    expect(screen.getByRole("link", { name: /Bench Press/ })).toHaveAttribute(
      "href",
      "/en/progress/exercise/e2",
    )
  })

  it("shows the weight and reps of each PR", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RecentPrs items={items} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText("3 × 110 kg")).toBeInTheDocument()
    expect(screen.getByText("5 × 80 kg")).toBeInTheDocument()
  })

  it("uses the localized exercise name", () => {
    render(
      <NextIntlClientProvider locale="es" messages={es}>
        <RecentPrs items={items} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByRole("link", { name: /Sentadilla/ })).toHaveAttribute(
      "href",
      "/es/progress/exercise/e1",
    )
    expect(
      screen.getByRole("link", { name: /Bench Press/ }),
    ).toBeInTheDocument()
  })

  it("shows an empty state without PRs", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RecentPrs items={[]} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText(en.pr.empty)).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
