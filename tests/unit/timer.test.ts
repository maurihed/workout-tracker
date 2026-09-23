import { describe, expect, it } from "vitest"
import {
  adjust,
  pause,
  resume,
  skip,
  skipRound,
  startInterval,
  startRest,
  tick,
} from "@/features/workouts/lib/timer"

describe("timer reducer", () => {
  it("counts a rest timer down to idle in exactly its duration", () => {
    let s = startRest(2)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(2)
    s = tick(s)
    expect(s.remaining).toBe(1)
    s = tick(s)
    expect(s.remaining).toBe(0)
    expect(s.phase).toBe("idle")
    expect(s.running).toBe(false)
  })
  it("adjusts and never goes below zero", () => {
    let s = startRest(10)
    s = adjust(s, 15)
    expect(s.remaining).toBe(25)
    s = adjust(s, -100)
    expect(s.remaining).toBe(0)
  })
  it("pause freezes the countdown; resume continues", () => {
    let s = startRest(5)
    s = pause(s)
    s = tick(s)
    expect(s.remaining).toBe(5)
    s = resume(s)
    s = tick(s)
    expect(s.remaining).toBe(4)
  })
  it("runs interval work/rest rounds with exact phase durations", () => {
    let s = startInterval({ workSeconds: 2, restSeconds: 1, rounds: 2 })
    expect(s.phase).toBe("work")
    expect(s.remaining).toBe(2)
    expect(s.round).toBe(1)

    s = tick(s)
    expect(s.phase).toBe("work")
    expect(s.remaining).toBe(1)

    s = tick(s) // work lasted exactly 2s
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(1)

    s = tick(s) // rest lasted exactly 1s
    expect(s.phase).toBe("work")
    expect(s.remaining).toBe(2)
    expect(s.round).toBe(2)

    s = tick(s)
    expect(s.remaining).toBe(1)

    s = tick(s) // final work ended, no trailing rest
    expect(s.running).toBe(false)
  })
  it("skip ends the current timer", () => {
    expect(skip(startRest(60)).running).toBe(false)
  })
  it("skipRound advances to the next phase and ends when no round remains", () => {
    let s = startInterval({ workSeconds: 10, restSeconds: 5, rounds: 2 })
    s = skipRound(s)
    expect(s.phase).toBe("rest")
    expect(s.round).toBe(1)
    s = skipRound(s)
    expect(s.phase).toBe("work")
    expect(s.round).toBe(2)
    expect(s.remaining).toBe(10)
    s = skipRound(s)
    expect(s.running).toBe(false)
  })
  it("resume is a no-op on a finished timer", () => {
    const finished = tick(tick(startRest(2)))
    const resumed = resume(finished)
    expect(resumed.running).toBe(false)
    expect(resumed).toBe(finished)
  })
  it("guards interval inputs", () => {
    const s = startInterval({ workSeconds: -5, restSeconds: -1, rounds: 0 })
    expect(s.workSeconds).toBe(0)
    expect(s.restSeconds).toBe(0)
    expect(s.rounds).toBe(1)
    expect(s.remaining).toBe(0)
  })
})
