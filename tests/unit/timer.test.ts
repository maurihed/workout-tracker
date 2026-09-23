import { describe, expect, it } from "vitest"
import {
  adjust, pause, resume, skip, skipRound, startInterval, startRest, tick,
} from "@/features/workouts/lib/timer"

const T0 = 1_000_000

describe("timer reducer (wall-clock)", () => {
  it("counts a rest timer down to idle in exactly its duration", () => {
    let s = startRest(2, T0)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(2)
    expect(s.deadline).toBe(T0 + 2000)
    s = tick(s, T0 + 1000)
    expect(s.remaining).toBe(1)
    s = tick(s, T0 + 2000)
    expect(s.phase).toBe("idle")
    expect(s.running).toBe(false)
    expect(s.deadline).toBeNull()
  })

  it("shows the correct remaining after a long background jump", () => {
    const s = startRest(300, T0)
    const resumed = tick(s, T0 + 65_000)
    expect(resumed.remaining).toBe(235)
  })

  it("carries overshoot across a work→rest boundary instead of skipping rounds", () => {
    let s = startInterval({ workSeconds: 2, restSeconds: 1, rounds: 2 }, T0)
    // Jump 2.5s: work(2s) elapses, 0.5s bleeds into rest → 1s rounded up.
    s = tick(s, T0 + 2500)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(1)
    expect(s.round).toBe(1)
    expect(s.deadline).toBe(T0 + 2500 + 500)
  })

  it("pause freezes remaining and clears the deadline; resume re-arms it", () => {
    let s = startRest(5, T0)
    s = pause(s, T0 + 2000)
    expect(s.running).toBe(false)
    expect(s.remaining).toBe(3)
    expect(s.deadline).toBeNull()
    s = tick(s, T0 + 10_000)
    expect(s.remaining).toBe(3)
    s = resume(s, T0 + 10_000)
    expect(s.deadline).toBe(T0 + 13_000)
    s = tick(s, T0 + 11_000)
    expect(s.remaining).toBe(2)
  })

  it("adjust moves remaining and the deadline while running", () => {
    let s = startRest(10, T0)
    s = adjust(s, 15, T0)
    expect(s.remaining).toBe(25)
    expect(s.deadline).toBe(T0 + 25_000)
    s = adjust(s, -100, T0)
    expect(s.remaining).toBe(0)
    expect(s.phase).toBe("idle")
    expect(s.deadline).toBeNull()
  })

  it("skipRound advances immediately with a fresh deadline", () => {
    let s = startInterval({ workSeconds: 10, restSeconds: 5, rounds: 2 }, T0)
    s = skipRound(s, T0 + 1000)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(5)
    expect(s.deadline).toBe(T0 + 1000 + 5000)
    s = skipRound(s, T0 + 1000)
    expect(s.phase).toBe("work")
    expect(s.round).toBe(2)
    s = skipRound(s, T0 + 1000)
    expect(s.running).toBe(false)
  })

  it("skip ends the current timer", () => {
    expect(skip(startRest(60, T0)).running).toBe(false)
  })

  it("resume is a no-op on a finished timer", () => {
    const finished = tick(tick(startRest(2, T0), T0 + 2000), T0 + 2000)
    const resumed = resume(finished, T0 + 5000)
    expect(resumed.running).toBe(false)
    expect(resumed).toBe(finished)
  })

  it("guards interval inputs", () => {
    const s = startInterval({ workSeconds: -5, restSeconds: -1, rounds: 0 }, T0)
    expect(s.workSeconds).toBe(0)
    expect(s.restSeconds).toBe(0)
    expect(s.rounds).toBe(1)
    expect(s.remaining).toBe(0)
  })
})
