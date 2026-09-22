import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/server/services/exercise.service", () => ({
  listExercises: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { listExercises } from "@/server/services/exercise.service"
import { GET } from "@/app/api/exercises/route"

const authMock = vi.mocked(auth)
const listMock = vi.mocked(listExercises)

describe("GET /api/exercises", () => {
  it("returns 401 without a session and does not query the catalog", async () => {
    authMock.mockResolvedValue(null as never)

    const response = await GET(new Request("http://localhost/api/exercises"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Authentication required" },
    })
    expect(listMock).not.toHaveBeenCalled()
  })

  it("returns the catalog for an authenticated session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } } as never)
    listMock.mockResolvedValue({ items: [], nextCursor: null })

    const response = await GET(new Request("http://localhost/api/exercises"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: { items: [], nextCursor: null },
    })
    expect(listMock).toHaveBeenCalledWith({ limit: 20 })
  })
})
