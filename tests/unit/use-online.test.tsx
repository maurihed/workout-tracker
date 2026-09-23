import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "@/lib/offline/db"
import { enqueue } from "@/lib/offline/sync"
import { useOnlineStatus, useSyncStatus } from "@/lib/offline/use-online"

afterEach(async () => { await closeDb() })

describe("offline hooks", () => {
  it("reports online status and reflects pending outbox rows", async () => {
    const online = renderHook(() => useOnlineStatus())
    expect(online.result.current).toBe(true)

    const status = renderHook(() => useSyncStatus())
    expect(status.result.current.pending).toBe(0)
    await act(async () => { await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 }) })
    await waitFor(() => expect(status.result.current.pending).toBe(1))
  })
})
