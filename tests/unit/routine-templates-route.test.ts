import { describe, expect, expectTypeOf, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/profile.service", () => ({
  getProfile: vi.fn(async () => ({
    goal: "endurance",
    experience: "beginner",
    location: "home",
    daysPerWeek: 3,
    equipment: ["body only"],
  })),
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { auth } from "@/lib/auth"
import { GET } from "@/app/api/routine-templates/route"
import type { RoutineDTO as ServerRoutineDTO } from "@/server/services/routine.service"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const authMock = vi.mocked(auth)

describe("GET /api/routine-templates", () => {
  it("returns templates annotated with recommendation flags", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.templates.length).toBeGreaterThan(0)
    expect(typeof body.data.templates[0].recommended).toBe("boolean")
    expect(typeof body.data.templates[0].score).toBe("number")
  })

  it("returns 401 without a session", async () => {
    authMock.mockResolvedValueOnce(null as never)

    const res = await GET()

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Authentication required" },
    })
  })
})

describe("RoutineDTO", () => {
  it("is structurally identical to the server DTO", () => {
    expectTypeOf<ServerRoutineDTO>().toEqualTypeOf<RoutineDTO>()
  })
})
