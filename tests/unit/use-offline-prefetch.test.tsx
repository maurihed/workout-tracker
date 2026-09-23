import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useOfflinePrefetch } from "@/lib/offline/use-offline-prefetch"

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("useOfflinePrefetch", () => {
  it("fetches the given urls after an idle delay when online", () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchImpl)
    renderHook(() => useOfflinePrefetch(["/api/exercises", "/img/a.jpg"]))
    vi.advanceTimersByTime(3000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
