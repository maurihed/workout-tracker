import { afterEach, describe, expect, it } from "vitest"
import {
  closeDb, deleteActiveSession, deleteOutbox, getActiveSession, getOutbox, listOutbox,
  putActiveSession, putOutbox,
} from "@/lib/offline/db"

afterEach(async () => { await closeDb() })

describe("offline db", () => {
  it("round-trips outbox rows keyed by session id", async () => {
    await putOutbox({ sessionId: "s1", op: "upsert", payload: { a: 1 }, updatedAt: 1, status: "pending" })
    await putOutbox({ sessionId: "s2", op: "abandon", payload: null, updatedAt: 2, status: "pending" })
    expect((await getOutbox("s1"))?.payload).toEqual({ a: 1 })
    expect((await listOutbox()).map((r) => r.sessionId).sort()).toEqual(["s1", "s2"])
    await deleteOutbox("s1")
    expect(await getOutbox("s1")).toBeUndefined()
  })

  it("stores a single active-session record", async () => {
    await putActiveSession({ id: "active", value: { sessionId: "s1" }, updatedAt: 5 })
    expect((await getActiveSession())?.value).toEqual({ sessionId: "s1" })
    await deleteActiveSession()
    expect(await getActiveSession()).toBeUndefined()
  })
})
