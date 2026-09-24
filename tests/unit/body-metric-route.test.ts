import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/server/services/body-metric.service", () => ({
  listBodyMetrics: vi.fn(),
  upsertBodyMetric: vi.fn(),
  deleteBodyMetric: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { NotFoundError } from "@/lib/api-error"
import {
  deleteBodyMetric,
  listBodyMetrics,
  upsertBodyMetric,
} from "@/server/services/body-metric.service"
import { GET, PUT } from "@/app/api/body-metrics/route"
import { DELETE } from "@/app/api/body-metrics/[id]/route"

const authMock = vi.mocked(auth)
const listMock = vi.mocked(listBodyMetrics)
const upsertMock = vi.mocked(upsertBodyMetric)
const deleteMock = vi.mocked(deleteBodyMetric)

const DTO = {
  id: "m1",
  recordedOn: "2026-01-05T00:00:00.000Z",
  weightKg: 80,
  bodyFatPct: null,
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function putRequest(body: unknown) {
  return new Request("http://x/api/body-metrics", {
    method: "PUT",
    body: JSON.stringify(body),
  })
}

describe("/api/body-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET returns 401 without a session and does not query", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await GET(new Request("http://x/api/body-metrics"))
    expect(res.status).toBe(401)
    expect(listMock).not.toHaveBeenCalled()
  })

  it("GET lists the user's entries", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    listMock.mockResolvedValue([DTO])
    const res = await GET(new Request("http://x/api/body-metrics?from=2026-01-01&to=2026-01-31"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [DTO] })
    expect(listMock).toHaveBeenCalledWith("u1", { from: "2026-01-01", to: "2026-01-31" })
  })

  it("GET rejects a malformed date filter", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    const res = await GET(new Request("http://x/api/body-metrics?from=garbage"))
    expect(res.status).toBe(400)
    expect(listMock).not.toHaveBeenCalled()
  })

  it("PUT returns 401 without a session", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await PUT(putRequest({ recordedOn: "2026-01-05", weightKg: 80 }))
    expect(res.status).toBe(401)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("PUT rejects an entry with no measurements", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    const res = await PUT(
      putRequest({ recordedOn: "2026-01-05", weightKg: null, bodyFatPct: null }),
    )
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("PUT upserts and returns the entry", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    upsertMock.mockResolvedValue(DTO)
    const res = await PUT(putRequest({ recordedOn: "2026-01-05", weightKg: 80 }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: DTO })
    expect(upsertMock).toHaveBeenCalledWith("u1", { recordedOn: "2026-01-05", weightKg: 80 })
  })

  it("DELETE returns 401 without a session", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await DELETE(new Request("http://x/api/body-metrics/m1", { method: "DELETE" }), ctx("m1"))
    expect(res.status).toBe(401)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it("DELETE removes the entry", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    deleteMock.mockResolvedValue(undefined)
    const res = await DELETE(new Request("http://x/api/body-metrics/m1", { method: "DELETE" }), ctx("m1"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { deleted: true } })
    expect(deleteMock).toHaveBeenCalledWith("u1", "m1")
  })

  it("DELETE maps a missing entry to 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    deleteMock.mockRejectedValue(new NotFoundError("Body metric not found"))
    const res = await DELETE(new Request("http://x/api/body-metrics/missing", { method: "DELETE" }), ctx("missing"))
    expect(res.status).toBe(404)
  })
})
