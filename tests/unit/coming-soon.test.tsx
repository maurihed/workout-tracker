import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { ComingSoon } from "@/components/shared/coming-soon"

describe("ComingSoon", () => {
  it("renders the localized title and message", () => {
    render(<ComingSoon titleKey="workout" />)
    expect(
      screen.getByRole("heading", { name: "workout.title" }),
    ).toBeInTheDocument()
    expect(screen.getByText("comingSoon.message")).toBeInTheDocument()
  })

  it("resolves the title for each placeholder tab", () => {
    const { rerender } = render(<ComingSoon titleKey="progress" />)
    expect(
      screen.getByRole("heading", { name: "progress.title" }),
    ).toBeInTheDocument()

    rerender(<ComingSoon titleKey="profile" />)
    expect(
      screen.getByRole("heading", { name: "profile.title" }),
    ).toBeInTheDocument()
  })
})
