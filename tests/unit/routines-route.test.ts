import { describe, expect, expectTypeOf, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/routine.service", () => ({
  listRoutines: vi.fn(async () => [{ id: "r1", name: "A", isActive: true, dayCount: 1, exerciseCount: 2 }]),
  createBlankRoutine: vi.fn(async (_u: string, input: { name: string }) => ({ id: "r2", name: input.name, days: [] })),
}))

import { GET, POST } from "@/app/api/routines/route"
import type { RoutineSummary as ServerRoutineSummary } from "@/server/repositories/routine.repository"
import type { RoutineSummary } from "@/features/routines/hooks/use-routines"

describe("/api/routines", () => {
  it("GET returns the list envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].id).toBe("r1")
  })
  it("POST rejects an invalid body with 400", async () => {
    const res = await POST(new Request("http://x/api/routines", { method: "POST", body: JSON.stringify({ name: "" }) }))
    expect(res.status).toBe(400)
  })
  it("POST creates with 201", async () => {
    const res = await POST(new Request("http://x/api/routines", { method: "POST", body: JSON.stringify({ name: "New" }) }))
    expect(res.status).toBe(201)
  })
})

describe("RoutineSummary", () => {
  it("is structurally identical to the server summary", () => {
    expectTypeOf<ServerRoutineSummary>().toEqualTypeOf<RoutineSummary>()
  })
})
