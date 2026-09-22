import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `theme.${key}`,
}))
vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

import { ThemeToggle } from "@/components/theme-toggle"

describe("ThemeToggle", () => {
  it("exposes a localized accessible label", () => {
    render(<ThemeToggle />)
    expect(
      screen.getByRole("button", { name: "theme.label" }),
    ).toBeInTheDocument()
  })
})
