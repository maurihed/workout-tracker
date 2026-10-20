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
  AI_JOB_MAX_ATTEMPTS,
  AI_JOB_STALE_MS,
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
  location: "gym" as const,
  equipment: [] as string[],
  gymProfile: "intermediate" as const,
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

function unavailableProvider(): AiProvider {
  return {
    generateJson: vi.fn(async () => {
      throw new AiUnavailableError()
    }),
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
            reps: "8-12",
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
            instructions: [
              "Set up with your hands shoulder-width apart.",
              "Press up while keeping a straight line from head to heels.",
            ],
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
      where: { sourceId: "Barbell_Full_Squat" },
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

  it("falls back to a non-empty template when the model returns a zero-exercise day", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    const provider = providerReturning({
      name: "Empty",
      goal: "build_muscle",
      days: [{ weekday: 0, exercises: [] }],
    })

    await runJob(job.id, provider)

    expect(provider.generateJson.mock.calls.length).toBeGreaterThan(1)
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("succeeded")
    const result = stored.result as unknown as AiJobResult
    expect(result.source).toBe("template")
    expect(result.routine.days.length).toBeGreaterThan(0)
    expect(result.routine.days[0]!.exercises.length).toBeGreaterThan(0)
  })

  it("saves a template fallback as a template-sourced routine", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    const provider: AiProvider = {
      generateJson: vi.fn(async () => {
        throw new AiUnavailableError()
      }),
    }

    await runJob(job.id, provider)
    const { routineId } = await acceptJob(user.id, job.id)

    const routine = await prisma.routine.findUniqueOrThrow({
      where: { id: routineId },
    })
    expect(routine.source).toBe("template")
    expect(routine.aiJobId).toBe(job.id)
  })

  it("reclaims a stale running job", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        startedAt: new Date(Date.now() - AI_JOB_STALE_MS - 60_000),
      },
    })

    const provider = providerReturning(buildGeneratedRoutine())
    await runJob(job.id, provider)

    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("succeeded")
    expect(stored.attempts).toBeGreaterThanOrEqual(1)
    expect(provider.generateJson).toHaveBeenCalled()
  })

  it("abandons a stale running job after the maximum attempts", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "running",
        attempts: AI_JOB_MAX_ATTEMPTS,
        startedAt: new Date(Date.now() - AI_JOB_STALE_MS - 60_000),
      },
    })

    const provider = providerReturning(buildGeneratedRoutine())
    await runJob(job.id, provider)

    expect(provider.generateJson).not.toHaveBeenCalled()
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("failed")
  })

  it("leaves a fresh running job untouched", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date() },
    })

    const provider = providerReturning(buildGeneratedRoutine())
    await runJob(job.id, provider)

    expect(provider.generateJson).not.toHaveBeenCalled()
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect(stored.status).toBe("running")
  })

  it("rejects accepting a stored result with duplicate weekdays", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, INPUT)
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))

    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    const result = stored.result as unknown as AiJobResult
    result.routine.days.push({ ...result.routine.days[0]!, label: "Duplicate" })
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { result: result as never },
    })

    await expect(acceptJob(user.id, job.id)).rejects.toMatchObject({
      code: "P2002",
    })
    const count = await prisma.routine.count({
      where: { userId: user.id, aiJobId: job.id },
    })
    expect(count).toBe(0)
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
        days: {
          include: {
            exercises: {
              orderBy: { order: "asc" },
              include: { exercise: true },
            },
          },
        },
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
      customName: "Zzqx Wibbleflarp",
      timerType: "interval",
      workSeconds: 40,
      rounds: 5,
      exercise: {
        name: "Zzqx Wibbleflarp",
        isCustom: true,
        instructions: [
          "Set up with your hands shoulder-width apart.",
          "Press up while keeping a straight line from head to heels.",
        ],
      },
    })
    expect(exercises[1]!.exerciseId).not.toBeNull()
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

    await expect(getJob(stranger.id, job.id)).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(acceptJob(stranger.id, job.id)).rejects.toBeInstanceOf(
      NotFoundError,
    )
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

    await expect(createJob(user.id, INPUT)).rejects.toBeInstanceOf(
      RateLimitError,
    )
    expect(queueMock.enqueueAiJob).not.toHaveBeenCalled()
  })

  it("ignores failed and cancelled jobs toward the daily quota", async () => {
    const user = await makeUser()
    await prisma.aiJob.createMany({
      data: Array.from({ length: AI_JOB_DAILY_LIMIT }, () => ({
        userId: user.id,
        status: "failed" as const,
        input: INPUT,
      })),
    })

    const job = await createJob(user.id, INPUT)
    expect(job.status).toBe("queued")
  })

  it("personalizes a succeeded result from recent history", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({
      where: { sourceId: "Barbell_Full_Squat" },
    })
    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        name: "hist",
        status: "completed",
        completedAt: new Date(),
        snapshot: {},
        exercises: {
          create: {
            exerciseId: exercise.id,
            order: 0,
            nameSnapshot: "Barbell Full Squat",
            completed: true,
            sets: {
              create: {
                setNumber: 1,
                type: "working",
                weightKg: 100,
                reps: 12,
                completedAt: new Date(),
              },
            },
          },
        },
      },
    })
    const job = await createJob(user.id, {
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 3,
    })
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    const result = stored.result as {
      personalized: boolean
      personalizedCount: number
      routine: { days: { exercises: { targetWeightKg?: number | null }[] }[] }
    }
    expect(result.personalized).toBe(true)
    expect(result.personalizedCount).toBeGreaterThan(0)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(105)
  })

  it("leaves the load unchanged when personalize is false", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({
      where: { sourceId: "Barbell_Full_Squat" },
    })
    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        name: "hist",
        status: "completed",
        completedAt: new Date(),
        snapshot: {},
        exercises: {
          create: {
            exerciseId: exercise.id,
            order: 0,
            nameSnapshot: "Barbell Full Squat",
            completed: true,
            sets: {
              create: {
                setNumber: 1,
                type: "working",
                weightKg: 100,
                reps: 12,
                completedAt: new Date(),
              },
            },
          },
        },
      },
    })
    const job = await createJob(user.id, {
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 3,
      personalize: false,
    })
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect((stored.result as { personalized: boolean }).personalized).toBe(
      false,
    )
  })

  it("keeps the provider's load byte-identical when personalize is false", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({
      where: { sourceId: "Barbell_Full_Squat" },
    })
    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        name: "hist",
        status: "completed",
        completedAt: new Date(),
        snapshot: {},
        exercises: {
          create: {
            exerciseId: exercise.id,
            order: 0,
            nameSnapshot: "Barbell Full Squat",
            completed: true,
            sets: {
              create: {
                setNumber: 1,
                type: "working",
                weightKg: 100,
                reps: 12,
                completedAt: new Date(),
              },
            },
          },
        },
      },
    })
    const base = buildGeneratedRoutine()
    const routine = {
      ...base,
      days: [
        {
          ...base.days[0]!,
          exercises: [
            { ...base.days[0]!.exercises[0]!, targetWeightKg: 60 },
            base.days[0]!.exercises[1]!,
          ],
        },
      ],
    }
    const job = await createJob(user.id, {
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 3,
      personalize: false,
    })
    await runJob(job.id, providerReturning(routine))
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    const result = stored.result as unknown as AiJobResult
    expect(result.personalized).toBe(false)
    expect(result.routine.days[0]!.exercises[0]!.targetWeightKg).toBe(60)
  })

  it("marks personalized false when the user has no history", async () => {
    const user = await makeUser()
    const job = await createJob(user.id, {
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 3,
    })
    await runJob(job.id, providerReturning(buildGeneratedRoutine()))
    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    expect((stored.result as { personalized: boolean }).personalized).toBe(
      false,
    )
  })

  it("personalizes the template fallback from recent history", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({
      where: { sourceId: "Barbell_Full_Squat" },
    })
    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        name: "hist",
        status: "completed",
        completedAt: new Date(),
        snapshot: {},
        exercises: {
          create: {
            exerciseId: exercise.id,
            order: 0,
            nameSnapshot: "Barbell Full Squat",
            completed: true,
            sets: {
              create: {
                setNumber: 1,
                type: "working",
                weightKg: 100,
                reps: 12,
                completedAt: new Date(),
              },
            },
          },
        },
      },
    })
    const job = await createJob(user.id, {
      goal: "general_fitness",
      experience: "beginner",
      equipment: ["body only", "dumbbell", "barbell", "machine"],
      daysPerWeek: 3,
    })
    await runJob(job.id, unavailableProvider())

    const stored = await prisma.aiJob.findUniqueOrThrow({
      where: { id: job.id },
    })
    const result = stored.result as unknown as AiJobResult
    expect(result.source).toBe("template")
    expect(result.personalized).toBe(true)
    expect(result.personalizedCount).toBeGreaterThan(0)
    const squat = result.routine.days
      .flatMap((day) => day.exercises)
      .find((item) => item.sourceId === "Barbell_Full_Squat")
    expect(squat?.targetWeightKg).toBe(105)
  })
})
