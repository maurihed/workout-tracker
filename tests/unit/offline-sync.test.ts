import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, getOutbox, listOutbox } from "@/lib/offline/db"
import { enqueue, flushOutbox } from "@/lib/offline/sync"

beforeEach(async () => { await closeDb() })
afterEach(async () => { await closeDb() })

function json(status: number) {
  return new Response(JSON.stringify({ data: {} }), { status, headers: { "Content-Type": "application/json" } })
}

describe("sync engine", () => {
  it("coalesces an upsert into a later upsert (one row, latest payload)", async () => {
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 1 })
    await enqueue("upsert", "s1", { state: { v: 2 }, activeSeconds: 2 })
    const rows = await listOutbox()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.op).toBe("upsert")
    expect((rows[0]?.payload as { state: { v: number } }).state.v).toBe(2)
  })

  it("lets complete supersede an upsert but keeps the state payload", async () => {
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 1 })
    await enqueue("complete", "s1", { state: { v: 2 }, activeSeconds: 9 })
    const row = await getOutbox("s1")
    expect(row?.op).toBe("complete")
    expect((row?.payload as { activeSeconds: number }).activeSeconds).toBe(9)
  })

  it("flushes upsert with PUT and clears the row", async () => {
    const fetchImpl = vi.fn(async () => json(200)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 3 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 1, pending: 0, failed: false })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe("/api/sessions/s1")
    expect(await listOutbox()).toHaveLength(0)
  })

  it("flushes complete as PUT then POST /complete", async () => {
    const calls: { url: string; method: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" })
      return json(200)
    }) as unknown as typeof fetch
    await enqueue("complete", "s1", { state: { v: 1 }, activeSeconds: 7 })
    const result = await flushOutbox({ fetchImpl })
    expect(result.synced).toBe(1)
    expect(calls).toEqual([
      { url: "/api/sessions/s1", method: "PUT" },
      { url: "/api/sessions/s1/complete", method: "POST" },
    ])
  })

  it("keeps the row on a retryable 500 and reports failure", async () => {
    const fetchImpl = vi.fn(async () => json(500)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 0, pending: 1, failed: true })
    expect((await getOutbox("s1"))?.status).toBe("pending")
  })

  it("marks a non-retryable 400 as error", async () => {
    const fetchImpl = vi.fn(async () => json(400)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result.failed).toBe(true)
    expect((await getOutbox("s1"))?.status).toBe("error")
  })

  it("treats a network throw as retryable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline") }) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 0, pending: 1, failed: true })
  })

  it("deletes an abandon row on 404 (never synced)", async () => {
    const fetchImpl = vi.fn(async () => json(404)) as unknown as typeof fetch
    await enqueue("abandon", "s1", { state: {}, activeSeconds: 0 })
    await flushOutbox({ fetchImpl })
    expect(await listOutbox()).toHaveLength(0)
  })

  it("does not clobber a newer enqueue made while the send is in flight", async () => {
    let clock = 1000
    const now = () => clock++
    let injected = false
    const bodies: unknown[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined)
      if (!injected) {
        injected = true
        await enqueue("upsert", "s1", { state: { v: 2 }, activeSeconds: 2 }, { now })
      }
      return json(200)
    }) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 1 }, { now })
    const first = await flushOutbox({ fetchImpl, now })
    expect(first.failed).toBe(false)
    const row = await getOutbox("s1")
    expect((row?.payload as { state: { v: number } }).state.v).toBe(2)
    const second = await flushOutbox({ fetchImpl, now })
    expect(second.synced).toBe(1)
    expect(await listOutbox()).toHaveLength(0)
    expect(bodies).toEqual([{ v: 1 }, { v: 2 }])
  })
})
