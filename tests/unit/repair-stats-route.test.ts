import { describe, expect, it, vi, beforeEach } from "vitest"
vi.mock("@/server/services/stats.service", () => ({ repairAllStats: vi.fn(async () => ({ repaired: 3 })) }))
import { POST } from "@/app/api/jobs/repair-stats/route"

beforeEach(() => { process.env.JOBS_SECRET = "s3cret" })

describe("POST /api/jobs/repair-stats", () => {
  it("rejects a missing/incorrect secret", async () => {
    const res = await POST(new Request("http://x/api/jobs/repair-stats", { method: "POST" }))
    expect(res.status).toBe(401)
  })
  it("runs with the correct secret", async () => {
    const res = await POST(new Request("http://x/api/jobs/repair-stats", { method: "POST", headers: { "x-job-secret": "s3cret" } }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { repaired: 3 } })
  })
})
