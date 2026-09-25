import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/server/services/ai.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/ai.service")>()
  return {
    ...actual,
    createJob: vi.fn(),
    getJob: vi.fn(),
    listJobs: vi.fn(),
    cancelJob: vi.fn(),
    acceptJob: vi.fn(),
  }
})

import { auth } from "@/lib/auth"
import { NotFoundError, RateLimitError, ValidationError } from "@/lib/api-error"
import {
  acceptJob,
  cancelJob,
  createJob,
  getJob,
  listJobs,
} from "@/server/services/ai.service"
import { GET as listJobsRoute, POST as createJobRoute } from "@/app/api/ai/routines/route"
import { GET as getJobRoute } from "@/app/api/ai/routines/[id]/route"
import { POST as cancelJobRoute } from "@/app/api/ai/routines/[id]/cancel/route"
import { POST as acceptJobRoute } from "@/app/api/ai/routines/[id]/accept/route"
import { toAiJobDTO } from "@/features/ai/schemas/job"

const authMock = vi.mocked(auth)
const createJobMock = vi.mocked(createJob)
const getJobMock = vi.mocked(getJob)
const listJobsMock = vi.mocked(listJobs)
const cancelJobMock = vi.mocked(cancelJob)
const acceptJobMock = vi.mocked(acceptJob)

const NOW = new Date("2026-09-25T10:00:00.000Z")
const FINISHED_AT = new Date("2026-09-25T10:00:05.000Z")

const INPUT = {
  goal: "build_muscle",
  experience: "beginner",
  equipment: [],
  daysPerWeek: 3,
  focus: null,
}

const QUEUED_JOB = {
  id: "j1",
  userId: "u1",
  status: "queued",
  input: INPUT,
  result: null,
  model: null,
  promptVersion: null,
  error: null,
  attempts: 0,
  createdAt: NOW,
  startedAt: null,
  finishedAt: null,
}

const QUEUED_DTO = {
  id: "j1",
  status: "queued",
  input: INPUT,
  result: null,
  model: null,
  promptVersion: null,
  error: null,
  createdAt: NOW.toISOString(),
  startedAt: null,
  finishedAt: null,
}

const CANCELLED_JOB = {
  ...QUEUED_JOB,
  status: "cancelled",
  finishedAt: FINISHED_AT,
}

const CANCELLED_DTO = {
  ...QUEUED_DTO,
  status: "cancelled",
  finishedAt: FINISHED_AT.toISOString(),
}

const RESULT = {
  source: "ai",
  customNames: ["Landmine Press"],
  routine: {
    name: "Upper Strength",
    goal: "build_muscle",
    days: [
      {
        weekday: 1,
        label: "Push",
        exercises: [
          {
            sourceId: "Barbell_Bench_Press",
            name: "Barbell Bench Press",
            sets: 4,
            reps: "6-8",
            restSeconds: 120,
            targetWeightKg: 60,
            timerType: "none",
            workSeconds: null,
            rounds: null,
            exerciseId: "e1",
            customName: null,
          },
        ],
      },
    ],
  },
}

const SUCCEEDED_JOB = {
  ...QUEUED_JOB,
  status: "succeeded",
  result: RESULT,
  model: "gpt-x",
  promptVersion: "v1",
  startedAt: NOW,
  finishedAt: FINISHED_AT,
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function postRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function signIn() {
  authMock.mockResolvedValue({ user: { id: "u1" } } as never)
}

describe("/api/ai/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POST returns 401 without a session and does not create a job", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await createJobRoute(postRequest("http://x/api/ai/routines", INPUT))
    expect(res.status).toBe(401)
    expect(createJobMock).not.toHaveBeenCalled()
  })

  it("GET returns 401 without a session and does not list jobs", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await listJobsRoute()
    expect(res.status).toBe(401)
    expect(listJobsMock).not.toHaveBeenCalled()
  })

  it("POST creates a job for the session user and returns 202", async () => {
    signIn()
    createJobMock.mockResolvedValue(QUEUED_JOB as never)
    const res = await createJobRoute(postRequest("http://x/api/ai/routines", INPUT))
    expect(res.status).toBe(202)
    await expect(res.json()).resolves.toEqual({ data: QUEUED_DTO })
    expect(createJobMock).toHaveBeenCalledWith("u1", INPUT)
  })

  it("POST maps a malformed JSON body to 400", async () => {
    signIn()
    const res = await createJobRoute(
      new Request("http://x/api/ai/routines", { method: "POST", body: "{not json" }),
    )
    expect(res.status).toBe(400)
    expect(createJobMock).not.toHaveBeenCalled()
  })

  it("POST maps a service ValidationError to 400", async () => {
    signIn()
    createJobMock.mockRejectedValue(new ValidationError("Invalid AI job input"))
    const res = await createJobRoute(postRequest("http://x/api/ai/routines", { goal: "nope" }))
    expect(res.status).toBe(400)
  })

  it("POST maps the service quota error to 429", async () => {
    signIn()
    createJobMock.mockRejectedValue(new RateLimitError("Daily AI generation limit reached"))
    const res = await createJobRoute(postRequest("http://x/api/ai/routines", INPUT))
    expect(res.status).toBe(429)
  })

  it("GET lists the session user's jobs", async () => {
    signIn()
    listJobsMock.mockResolvedValue([QUEUED_JOB, CANCELLED_JOB] as never)
    const res = await listJobsRoute()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: [QUEUED_DTO, CANCELLED_DTO] })
    expect(listJobsMock).toHaveBeenCalledWith("u1")
  })

  it("GET [id] returns 401 without a session", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await getJobRoute(new Request("http://x/api/ai/routines/j1"), ctx("j1"))
    expect(res.status).toBe(401)
    expect(getJobMock).not.toHaveBeenCalled()
  })

  it("GET [id] returns the session user's job", async () => {
    signIn()
    getJobMock.mockResolvedValue(QUEUED_JOB as never)
    const res = await getJobRoute(new Request("http://x/api/ai/routines/j1"), ctx("j1"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: QUEUED_DTO })
    expect(getJobMock).toHaveBeenCalledWith("u1", "j1")
  })

  it("GET [id] maps a missing job to 404", async () => {
    signIn()
    getJobMock.mockRejectedValue(new NotFoundError("AI job not found"))
    const res = await getJobRoute(new Request("http://x/api/ai/routines/missing"), ctx("missing"))
    expect(res.status).toBe(404)
  })

  it("POST cancel returns 401 without a session", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await cancelJobRoute(
      postRequest("http://x/api/ai/routines/j1/cancel"),
      ctx("j1"),
    )
    expect(res.status).toBe(401)
    expect(cancelJobMock).not.toHaveBeenCalled()
  })

  it("POST cancel cancels the session user's job", async () => {
    signIn()
    cancelJobMock.mockResolvedValue(CANCELLED_JOB as never)
    const res = await cancelJobRoute(
      postRequest("http://x/api/ai/routines/j1/cancel"),
      ctx("j1"),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: CANCELLED_DTO })
    expect(cancelJobMock).toHaveBeenCalledWith("u1", "j1")
  })

  it("POST accept returns 401 without a session", async () => {
    authMock.mockResolvedValue(null as never)
    const res = await acceptJobRoute(
      postRequest("http://x/api/ai/routines/j1/accept"),
      ctx("j1"),
    )
    expect(res.status).toBe(401)
    expect(acceptJobMock).not.toHaveBeenCalled()
  })

  it("POST accept saves the job as a routine and returns 201", async () => {
    signIn()
    acceptJobMock.mockResolvedValue({ routineId: "r1" })
    const res = await acceptJobRoute(
      postRequest("http://x/api/ai/routines/j1/accept"),
      ctx("j1"),
    )
    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ data: { routineId: "r1" } })
    expect(acceptJobMock).toHaveBeenCalledWith("u1", "j1")
  })
})

describe("toAiJobDTO", () => {
  it("serializes timestamps and parses a succeeded result", () => {
    const dto = toAiJobDTO(SUCCEEDED_JOB as never)
    expect(dto).toEqual({
      id: "j1",
      status: "succeeded",
      input: INPUT,
      result: RESULT,
      model: "gpt-x",
      promptVersion: "v1",
      error: null,
      createdAt: NOW.toISOString(),
      startedAt: NOW.toISOString(),
      finishedAt: FINISHED_AT.toISOString(),
    })
  })

  it("returns null for an unparseable result and input", () => {
    const dto = toAiJobDTO({
      ...QUEUED_JOB,
      input: { goal: "not-a-goal" },
      result: { nope: true },
    } as never)
    expect(dto.input).toBeNull()
    expect(dto.result).toBeNull()
  })
})
