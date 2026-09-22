import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"

describe("ThemeProvider", () => {
  it("renders children with the dark class applied by default", async () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <span>hello</span>
      </ThemeProvider>,
    )
    expect(screen.getByText("hello")).toBeInTheDocument()
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    )
  })
})
