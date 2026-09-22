import { render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { PreferencesStep } from "@/features/onboarding/components/preferences-step"

function Harness({ initial }: { initial: string | null }) {
  const [timezone, setTimezone] = useState<string | null>(initial)
  return (
    <PreferencesStep
      unitSystem="metric"
      timezone={timezone}
      onUnitSystemChange={vi.fn()}
      onTimezoneChange={setTimezone}
    />
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PreferencesStep", () => {
  it("auto-detects the timezone and populates the field at the UTC default", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Europe/Madrid",
    } as Intl.ResolvedDateTimeFormatOptions)

    render(<Harness initial="UTC" />)

    await waitFor(() =>
      expect(screen.getByLabelText("timezone")).toHaveValue("Europe/Madrid"),
    )
  })

  it("falls back to UTC when detection throws", async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
      () => {
        throw new Error("no ICU")
      },
    )

    render(<Harness initial={null} />)

    await waitFor(() =>
      expect(screen.getByLabelText("timezone")).toHaveValue("UTC"),
    )
  })

  it("does not override a timezone the user already chose", () => {
    const resolvedOptions = vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
    )
    render(<Harness initial="America/New_York" />)
    expect(screen.getByLabelText("timezone")).toHaveValue("America/New_York")
    expect(resolvedOptions).not.toHaveBeenCalled()
  })
})
