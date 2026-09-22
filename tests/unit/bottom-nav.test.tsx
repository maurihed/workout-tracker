import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BottomNav } from "@/components/shared/bottom-nav"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/routines",
}))

describe("BottomNav", () => {
  it("renders one link per nav item", () => {
    render(<BottomNav />)
    expect(screen.getAllByRole("link")).toHaveLength(5)
  })

  it("marks the active route", () => {
    render(<BottomNav />)
    const active = screen.getByRole("link", { name: /routines/i })
    expect(active).toHaveAttribute("aria-current", "page")
  })
})
