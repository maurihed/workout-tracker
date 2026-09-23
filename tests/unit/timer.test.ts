import { describe, expect, it } from "vitest"
import {
  adjust,
  pause,
  resume,
  skip,
  startInterval,
  startRest,
  tick,
} from "@/features/workouts/lib/timer"

describe("timer reducer", () => {
  it("counts a rest timer down to idle", () => {
    let s = startRest(2)
    expect(s.remaining).toBe(2)
    s = tick(s)
    expect(s.remaining).toBe(1)
    s = tick(s)
    expect(s.remaining).toBe(0)
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
  it("runs interval work/rest rounds and finishes", () => {
    let s = startInterval({ workSeconds: 2, restSeconds: 1, rounds: 2 })
    expect(s.phase).toBe("work")
    expect(s.round).toBe(1)
    s = tick(tick(tick(s))) // 2 work ticks -> transition to rest
    expect(s.phase).toBe("rest")
    s = tick(s) // rest done -> next round work
    expect(s.round).toBe(2)
    s = tick(tick(tick(s)))
    expect(s.running).toBe(false)
  })
  it("skip ends the current timer", () => {
    expect(skip(startRest(60)).running).toBe(false)
  })
})
