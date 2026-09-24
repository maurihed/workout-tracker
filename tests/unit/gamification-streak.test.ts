import { describe, expect, it } from "vitest"
import { computeStreak } from "@/features/gamification/lib/streak"

const weekdays = (...days: number[]) => new Set(days)
const mon = weekdays(1) // Monday only

describe("computeStreak", () => {
  it("counts consecutive hit days on scheduled weekdays", () => {
    // Mon 2026-01-05, Mon 2026-01-12
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
    expect(r.longest).toBe(2)
    expect(r.lastHitDate).toBe("2026-01-12")
  })

  it("treats non-scheduled days as neutral (do not break or extend)", () => {
    // Hits on Mon 01-05 and Mon 01-12; the whole week between is neutral.
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
  })

  it("breaks the streak on a missed scheduled day older than the freeze window", () => {
    // Missed Mon 01-12, next hit Mon 01-19 (7 days later).
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-19"], scheduledWeekdays: mon, today: "2026-01-19", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.longest).toBe(1)
    expect(r.freezesUsed).toBe(0)
  })

  it("auto-consumes a freeze for a recent missed scheduled day within 48h", () => {
    // Hit Mon 01-12; missed Mon 01-19; today Tue 01-20 (within 48h of the miss).
    const r = computeStreak({ hitDates: ["2026-01-12"], scheduledWeekdays: mon, today: "2026-01-20", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.freezesUsed).toBe(1)
    expect(r.freezesRemaining).toBe(1)
  })

  it("never goes negative on freezes", () => {
    const r = computeStreak({ hitDates: ["2026-01-12"], scheduledWeekdays: mon, today: "2026-01-20", freezesAvailable: 0 })
    expect(r.current).toBe(0)
    expect(r.freezesRemaining).toBe(0)
  })

  it("counts multiple sessions on one date once", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-05"], scheduledWeekdays: mon, today: "2026-01-05", freezesAvailable: 0 })
    expect(r.current).toBe(1)
  })

  it("returns zeros when there are no hits", () => {
    const r = computeStreak({ hitDates: [], scheduledWeekdays: mon, today: "2026-01-05", freezesAvailable: 2 })
    expect(r).toEqual({ current: 0, longest: 0, lastHitDate: null, freezesUsed: 0, freezesRemaining: 2 })
  })
})
