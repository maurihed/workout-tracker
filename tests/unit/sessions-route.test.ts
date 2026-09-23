import { describe, expect, expectTypeOf, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/session.service", () => ({
  getActiveSession: vi.fn(async () => null),
  startSession: vi.fn(async (_u: string, routineDayId: string) => ({ id: "s1", routineDayId, status: "in_progress" })),
}))

import { GET as ACTIVE } from "@/app/api/sessions/active/route"
import { POST } from "@/app/api/sessions/route"
import type { SessionDTO as ServerSessionDTO } from "@/server/services/session.service"
import type { SessionDTO } from "@/features/workouts/hooks/use-active-session"

describe("/api/sessions", () => {
  it("active returns null when none", async () => {
    const res = await ACTIVE()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: null })
  })
  it("POST rejects an invalid body with 400", async () => {
    const res = await POST(new Request("http://x/api/sessions", { method: "POST", body: JSON.stringify({ routineDayId: "" }) }))
    expect(res.status).toBe(400)
  })
  it("POST starts with 201", async () => {
    const res = await POST(new Request("http://x/api/sessions", { method: "POST", body: JSON.stringify({ routineDayId: "rd1" }) }))
    expect(res.status).toBe(201)
  })
})

describe("SessionDTO", () => {
  it("is structurally identical to the server DTO", () => {
    expectTypeOf<ServerSessionDTO>().toEqualTypeOf<SessionDTO>()
  })
})
