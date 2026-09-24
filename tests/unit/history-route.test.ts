import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/history.service", () => ({ listHistory: vi.fn(async () => ({ items: [], nextCursor: null })) }))
import { GET } from "@/app/api/history/route"

describe("GET /api/history", () => {
  it("returns an empty page", async () => {
    const res = await GET(new Request("http://x/api/history?limit=20"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { items: [], nextCursor: null } })
  })
  it("rejects a bad limit", async () => {
    const res = await GET(new Request("http://x/api/history?limit=999"))
    expect(res.status).toBe(400)
  })
  it("rejects a malformed cursor", async () => {
    const res = await GET(new Request("http://x/api/history?cursor=garbage"))
    expect(res.status).toBe(400)
  })
})
