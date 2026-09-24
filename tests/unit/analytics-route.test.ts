import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/server/services/progress.service", () => ({
  getOverview: vi.fn(),
  getExerciseProgress: vi.fn(),
}))

import { auth } from "@/lib/auth"
import { NotFoundError } from "@/lib/api-error"
import { getExerciseProgress, getOverview } from "@/server/services/progress.service"
import { GET as getOverviewRoute } from "@/app/api/analytics/overview/route"
import { GET as getExerciseProgressRoute } from "@/app/api/analytics/exercises/[exerciseId]/route"

const authMock = vi.mocked(auth)
const overviewMock = vi.mocked(getOverview)
const progressMock = vi.mocked(getExerciseProgress)

const OVERVIEW = {
  volumeByWeek: [{ weekStart: "2026-01-05", volumeKg: 2000, sessions: 2 }],
  muscleVolume: [{ muscle: "chest" as const, volumeKg: 1000 }],
  recentPrs: [
    {
      sessionId: "s1",
      date: "2026-01-05",
      exerciseId: "ex1",
      name: "Bench Press",
      nameEs: "Press de Banca",
      weightKg: 90,
      reps: 5,
    },
  ],
}

const PROGRESS = {
  exerciseId: "ex1",
  name: "Bench Press",
  nameEs: "Press de Banca",
  points: [{ date: "2026-01-05", e1rm: 105, topWeightKg: 90, reps: 5 }],
}

function ctx(exerciseId: string) {
  return { params: Promise.resolve({ exerciseId }) }
}

describe("GET /api/analytics/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 without a session and does not query", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await getOverviewRoute(new Request("http://x/api/analytics/overview"))
    expect(res.status).toBe(401)
    expect(overviewMock).not.toHaveBeenCalled()
  })

  it("returns the overview envelope with the default 12 weeks", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    overviewMock.mockResolvedValue(OVERVIEW)
    const res = await getOverviewRoute(new Request("http://x/api/analytics/overview"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: OVERVIEW })
    expect(overviewMock).toHaveBeenCalledWith("u1", 12)
  })

  it("coerces a weeks query param", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    overviewMock.mockResolvedValue(OVERVIEW)
    const res = await getOverviewRoute(new Request("http://x/api/analytics/overview?weeks=4"))
    expect(res.status).toBe(200)
    expect(overviewMock).toHaveBeenCalledWith("u1", 4)
  })

  it.each(["0", "53", "abc", "1.5"])("rejects weeks=%s", async (weeks) => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    const res = await getOverviewRoute(new Request(`http://x/api/analytics/overview?weeks=${weeks}`))
    expect(res.status).toBe(400)
    expect(overviewMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/analytics/exercises/[exerciseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 without a session and does not query", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await getExerciseProgressRoute(
      new Request("http://x/api/analytics/exercises/ex1"),
      ctx("ex1"),
    )
    expect(res.status).toBe(401)
    expect(progressMock).not.toHaveBeenCalled()
  })

  it("returns the exercise progress envelope", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    progressMock.mockResolvedValue(PROGRESS)
    const res = await getExerciseProgressRoute(
      new Request("http://x/api/analytics/exercises/ex1"),
      ctx("ex1"),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: PROGRESS })
    expect(progressMock).toHaveBeenCalledWith("u1", "ex1")
  })

  it("maps an unknown exercise to 404", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never)
    progressMock.mockRejectedValue(new NotFoundError("Exercise not found"))
    const res = await getExerciseProgressRoute(
      new Request("http://x/api/analytics/exercises/missing"),
      ctx("missing"),
    )
    expect(res.status).toBe(404)
  })
})
