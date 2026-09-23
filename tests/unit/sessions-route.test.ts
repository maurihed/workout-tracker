import { describe, expect, expectTypeOf, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/session.service", () => ({
  getActiveSession: vi.fn(async () => null),
  getSession: vi.fn(async () => null),
  upsertSession: vi.fn(async () => ({ id: "s1", status: "in_progress", activeSeconds: 0, completedAt: null })),
}))

import { GET as ACTIVE } from "@/app/api/sessions/active/route"
import { PUT } from "@/app/api/sessions/[sessionId]/route"
import type { SessionDTO as ServerSessionDTO } from "@/server/services/session.service"
import type { SessionDTO } from "@/features/workouts/hooks/use-active-session"

const ID = "33333333-3333-4333-8333-333333333333"
const SE = "11111111-1111-4111-8111-111111111111"
const body = {
  id: ID, routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0,
  snapshot: { routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push", exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null }] },
  exercises: [{ id: SE, exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [] }],
}

function ctx(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) }
}

describe("/api/sessions", () => {
  it("active returns null when none", async () => {
    const res = await ACTIVE()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: null })
  })
  it("PUT rejects a non-uuid session id", async () => {
    const res = await PUT(new Request("http://x/api/sessions/nope", { method: "PUT", body: JSON.stringify(body) }), ctx("nope"))
    expect(res.status).toBe(400)
  })
  it("PUT rejects a body whose id disagrees with the path", async () => {
    const res = await PUT(new Request("http://x/api/sessions/" + ID, { method: "PUT", body: JSON.stringify(body) }), ctx("44444444-4444-4444-8444-444444444444"))
    expect(res.status).toBe(400)
  })
  it("PUT upserts with 200", async () => {
    const res = await PUT(new Request("http://x/api/sessions/" + ID, { method: "PUT", body: JSON.stringify(body) }), ctx(ID))
    expect(res.status).toBe(200)
  })
})

describe("SessionDTO", () => {
  it("is structurally identical to the server DTO", () => {
    expectTypeOf<ServerSessionDTO>().toEqualTypeOf<SessionDTO>()
  })
})
