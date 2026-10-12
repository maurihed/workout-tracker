import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import HomePage from "@/app/[locale]/page"

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => (key: string) => key,
}))

describe("welcome page", () => {
  it("links to the dashboard", async () => {
    render(
      await HomePage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({}),
      }),
    )

    const cta = screen.getByRole("link", { name: /continue/i })
    expect(cta).toHaveAttribute("href", "/en/dashboard")
  })

  it("keeps the active locale in the dashboard link", async () => {
    render(
      await HomePage({
        params: Promise.resolve({ locale: "es" }),
        searchParams: Promise.resolve({}),
      }),
    )

    const cta = screen.getByRole("link", { name: /continue/i })
    expect(cta).toHaveAttribute("href", "/es/dashboard")
  })
})
