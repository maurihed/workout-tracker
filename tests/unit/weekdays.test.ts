import { describe, expect, it } from "vitest"

import { WEEKDAYS, weekdayLabel } from "@/features/routines/lib/weekdays"

// Sunday-first, matching the Date.getUTCDay()/Prisma convention used by the app.
const EXPECTED = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

describe("weekdayLabel", () => {
  it("maps all seven weekday indices to the correct day name", () => {
    for (const weekday of WEEKDAYS) {
      expect(weekdayLabel("en-US", weekday)).toBe(EXPECTED[weekday])
    }
  })

  it("is pinned to UTC so the host timezone cannot shift the label", () => {
    // A UTC-midnight reference date would read as the previous day in
    // negative-UTC zones if the formatter were not pinned to UTC.
    expect(weekdayLabel("en-US", 0)).toBe("Sunday")
    expect(weekdayLabel("en-US", 6)).toBe("Saturday")
  })
})
