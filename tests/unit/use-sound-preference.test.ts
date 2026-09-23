import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { useSoundPreference } from "@/features/workouts/hooks/use-sound-preference"

describe("useSoundPreference", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("defaults to on and persists the toggle", () => {
    const { result } = renderHook(() => useSoundPreference())
    expect(result.current[0]).toBe(true)

    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(window.localStorage.getItem("gym.runner.sound")).toBe("off")
  })

  it("reads a stored off value", () => {
    window.localStorage.setItem("gym.runner.sound", "off")
    const { result } = renderHook(() => useSoundPreference())
    expect(result.current[0]).toBe(false)
  })
})
