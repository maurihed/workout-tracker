import { describe, expect, it } from "vitest"
import { computeStreak } from "@/features/gamification/lib/streak"

const weekdays = (...days: number[]) => new Set(days)
const mon = weekdays(1)

describe("computeStreak", () => {
  it("counts consecutive hit days on scheduled weekdays", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
    expect(r.longest).toBe(2)
    expect(r.lastHitDate).toBe("2026-01-12")
  })

  it("treats non-scheduled days as neutral (do not break or extend)", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
  })

  it("breaks the streak on a missed scheduled day older than the freeze window", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-19"], scheduledWeekdays: mon, today: "2026-01-19", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.longest).toBe(1)
    expect(r.freezesUsed).toBe(0)
  })

  it("auto-consumes a freeze for a recent missed scheduled day within 48h", () => {
    const r = computeStreak({ hitDates: ["2026-01-12"], scheduledWeekdays: mon, today: "2026-01-20", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.freezesUsed).toBe(1)
    expect(r.freezesRemaining).toBe(1)
  })

  it("does not consume a freeze while the streak is already broken", () => {
    const r = computeStreak({ hitDates: ["2026-01-05"], scheduledWeekdays: weekdays(1, 2, 3, 4), today: "2026-01-09", freezesAvailable: 2 })
    expect(r.current).toBe(0)
    expect(r.freezesUsed).toBe(0)
    expect(r.freezesRemaining).toBe(2)
  })

  it("tracks the longest run across a break", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-19", "2026-01-26"], scheduledWeekdays: mon, today: "2026-01-26", freezesAvailable: 0 })
    expect(r.longest).toBe(2)
    expect(r.current).toBe(2)
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

  it("clamps freezesRemaining when there are no hits", () => {
    const r = computeStreak({ hitDates: [], scheduledWeekdays: mon, today: "2026-01-05", freezesAvailable: -1 })
    expect(r.freezesRemaining).toBe(0)
  })
})
