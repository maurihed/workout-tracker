import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { NotFoundError, RateLimitError } from "@/lib/api-error"
import { AiUnavailableError, type AiProvider } from "@/features/ai/lib/provider"
import { assertCatalogSeeded } from "./helpers/catalog"

const queueMock = vi.hoisted(() => ({
  enqueueAiJob: vi.fn(async () => {}),
  startAiWorker: vi.fn(async () => {}),
}))

vi.mock("@/server/ai/queue", () => ({
  AI_QUEUE: "ai-routine",
  enqueueAiJob: queueMock.enqueueAiJob,
  startAiWorker: queueMock.startAiWorker,
  getBoss: vi.fn(),
}))

import {
  AI_JOB_DAILY_LIMIT,
  acceptJob,
  cancelJob,
  createJob,
  getJob,
  listJobs,
  runJob,
  type AiJobResult,
} from "@/server/services/ai.service"

const INPUT = {
  goal: "build_muscle" as const,
  experience: "beginner" as const,
  equipment: [] as string[],
  daysPerWeek: 1,
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `ai_${Date.now()}${Math.random()}@ai-service-test.local`,
      profile: { create: {} },
    },
  })
}

type CatalogEntry = { id: string; sourceId: string; name: string }

let catalogEntry: CatalogEntry

function providerReturning(value: unknown): AiProvider & {
  generateJson: ReturnType<typeof vi.fn>
} {
  return { generateJson: vi.fn(async () => value) } as unknown as AiProvider & {
    generateJson: ReturnType<typeof vi.fn>
  }
}

function buildGeneratedRoutine() {
  return {
    name: "AI Push Pull",
    goal: "build_muscle",
    days: [
      {
        weekday: 0,
        label: "Push",
        exercises: [
          {
            sourceId: catalogEntry.sourceId,
            name: catalogEntry.name,
            sets: 4,
            reps: "8-10",
            restSeconds: 90,
            targetWeightKg: null,
            timerType: "none",
            workSeconds: null,
            rounds: null,
          },
          {
            sourceId: null,
            name: "Zzqx Wibbleflarp",
            sets: 3,
            reps: "30s",
            restSeconds: 60,
            targetWeightKg: null,
            timerType: "interval",
            workSeconds: 40,
            rounds: 5,
          },
        ],
      },
    ],
  }
}

describe("ai service", () => {
  beforeAll(async () => {
    await assertCatalogSeeded()
    const entry = await prisma.exercise.findFirstOrThrow({
      where: { isCustom: false },
      select: { id: true, sourceId: true, name: true },
    })
    catalogEntry = entry
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@ai-service-test.local" } },
    })
  })

  it("creates a queued job and enqueues it", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)

    expect(job.status).toBe("queued")
    expect(job.userId).toBe(user.id)
    expect(queueMock.enqueueAiJob).toHaveBeenCalledWith(job.id)

    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("queued")
    expect(stored.input).toMatchObject({ goal: "build_muscle", daysPerWeek: 1 })
  })

  it("throws a validation error for malformed input", async () => {
    const user = await makeUser()
    await expect(createJob(user.id, { goal: "nope" })).rejects.toMatchObject({
      code: "validation_error",
    })
    expect(queueMock.enqueueAiJob).not.toHaveBeenCalled()
  })

  it("runs a valid provider and stores a resolved AI result", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    const provider = providerReturning(buildGeneratedRoutine())

    await runJob(job.id, provider)

    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("succeeded")
    expect(stored.promptVersion).toBeTruthy()
    expect(stored.finishedAt).not.toBeNull()

    const result = stored.result as unknown as AiJobResult
    expect(result.source).toBe("ai")
    const exercises = result.routine.days[0]!.exercises
    expect(exercises[0]).toMatchObject({
      exerciseId: catalogEntry.id,
      customName: null,
      sourceId: catalogEntry.sourceId,
    })
    expect(exercises[1]).toMatchObject({
      exerciseId: null,
      customName: "Zzqx Wibbleflarp",
      rounds: 5,
      workSeconds: 40,
    })
    expect(result.customNames).toContain("Zzqx Wibbleflarp")
  })

  it("repairs invalid output then falls back to the template", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    const provider = providerReturning({ nope: 1 })

    await runJob(job.id, provider)

    expect(provider.generateJson.mock.calls.length).toBeGreaterThan(1)
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("succeeded")
    const result = stored.result as unknown as AiJobResult
    expect(result.source).toBe("template")
    expect(stored.model).toBeNull()
    expect(result.routine.days.length).toBeGreaterThan(0)
  })

  it("falls back to the template without retrying when the provider is unavailable", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    const provider: AiProvider = {
      generateJson: vi.fn(async () => {
        throw new AiUnavailableError()
      }),
    }

    await runJob(job.id, provider)

    expect(provider.generateJson).toHaveBeenCalledTimes(1)
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("succeeded")
    expect((stored.result as unknown as AiJobResult).source).toBe("template")
  })

  it("cancels a queued job and never runs it", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await cancelJob(user.id, job.id)
    expect((await getJob(user.id, job.id)).status).toBe("cancelled")

    const provider = providerReturning(buildGeneratedRoutine())
    await runJob(job.id, provider)

    expect(provider.generateJson).not.toHaveBeenCalled()
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("cancelled")
  })

  it("accepts a succeeded job into a single idempotent routine", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))

    const first = await acceptJob(user.id, job.id)
    const second = await acceptJob(user.id, job.id)
    expect(second.routineId).toBe(first.routineId)

    const routines = await prisma.routine.findMany({
      where: { userId: user.id, aiJobId: job.id },
      include: {
        days: { include: { exercises: { orderBy: { order: "asc" } } } },
      },
    })
    expect(routines).toHaveLength(1)

    const routine = routines[0]!
    expect(routine.source).toBe("ai")
    expect(routine.aiJobId).toBe(job.id)
    expect(routine.isActive).toBe(false)
    expect(routine.goal).toBe("build_muscle")
    expect(routine.days).toHaveLength(1)
    const exercises = routine.days[0]!.exercises
    expect(exercises).toHaveLength(2)
    expect(exercises[0]!.exerciseId).toBe(catalogEntry.id)
    expect(exercises[1]).toMatchObject({
      exerciseId: null,
      customName: "Zzqx Wibbleflarp",
      timerType: "interval",
      workSeconds: 40,
      rounds: 5,
    })
  })

  it("enforces a unique routine link per (userId, aiJobId)", async () => {
    const user = await makeUser()
    await prisma.routine.create({
      data: { userId: user.id, name: "First", aiJobId: "job-shared" },
    })

    await expect(
      prisma.routine.create({
        data: { userId: user.id, name: "Second", aiJobId: "job-shared" },
      }),
    ).rejects.toMatchObject({ code: "P2002" })
  })

  it("survives concurrent accepts with exactly one routine", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))

    const [first, second] = await Promise.all([
      acceptJob(user.id, job.id),
      acceptJob(user.id, job.id),
    ])
    expect(second.routineId).toBe(first.routineId)

    const count = await prisma.routine.count({
      where: { userId: user.id, aiJobId: job.id },
    })
    expect(count).toBe(1)
  })

  it("marks the job failed when enqueueing fails", async () => {
    const user = await makeUser()
    queueMock.enqueueAiJob.mockRejectedValueOnce(new Error("enqueue boom"))

    await expect(createJob(user.id, INPUT)).rejects.toThrow("enqueue boom")

    const job = await prisma.aiJob.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })
    expect(job.status).toBe("failed")
    expect(job.error).toContain("enqueue boom")
  })

  it("scopes job reads and accepts to the owner", async () => {
    const owner = await makeUser()
    const stranger = await makeUser()
    const job = await createJob(owner.id, INPUT)

    await expect(getJob(stranger.id, job.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(acceptJob(stranger.id, job.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("lists the user's jobs newest first", async () => {
    const user = await makeUser()
    const first = await createJob(user.id, INPUT)
    const second = await createJob(user.id, INPUT)

    const jobs = await listJobs(user.id)
    expect(jobs.map((job) => job.id)).toEqual([second.id, first.id])
  })

  it("enforces the daily job quota", async () => {
    const user = await makeUser()
    await prisma.aiJob.createMany({
      data: Array.from({ length: AI_JOB_DAILY_LIMIT }, () => ({
        userId: user.id,
        status: "succeeded" as const,
        input: INPUT,
      })),
    })

    await expect(createJob(user.id, INPUT)).rejects.toBeInstanceOf(RateLimitError)
    expect(queueMock.enqueueAiJob).not.toHaveBeenCalled()
  })
})
