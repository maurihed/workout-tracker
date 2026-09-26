import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import type { AiProvider } from "@/features/ai/lib/provider"
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

vi.mock("@/server/repositories/ai.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/repositories/ai.repository")>()
  return { ...actual, listRecentExerciseHistory: vi.fn(actual.listRecentExerciseHistory) }
})

vi.mock("@/features/ai/lib/personalize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ai/lib/personalize")>()
  return { ...actual, personalizeRoutine: vi.fn(actual.personalizeRoutine) }
})

import { listRecentExerciseHistory } from "@/server/repositories/ai.repository"
import { personalizeRoutine } from "@/features/ai/lib/personalize"
import { createJob, runJob, type AiJobResult } from "@/server/services/ai.service"

const PREFIX = "ai_resilience_it_"

const INPUT = {
  goal: "build_muscle" as const,
  experience: "beginner" as const,
  equipment: ["barbell"] as string[],
  daysPerWeek: 1,
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `${PREFIX}${Date.now()}${Math.random()}@ai-resilience-test.local`,
      profile: { create: {} },
    },
  })
}

async function seedSquatHistory(userId: string) {
  const exercise = await prisma.exercise.findFirstOrThrow({
    where: { sourceId: "Barbell_Full_Squat" },
  })
  await prisma.workoutSession.create({
    data: {
      userId,
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
}

function validProvider(): AiProvider {
  return {
    generateJson: vi.fn(async () => ({
      name: "AI Plan",
      goal: "build_muscle",
      days: [
        {
          weekday: 0,
          label: "Push",
          exercises: [
            {
              sourceId: "Barbell_Full_Squat",
              name: "Barbell Full Squat",
              sets: 3,
              reps: "8-12",
              restSeconds: 90,
              targetWeightKg: null,
              timerType: "none",
              workSeconds: null,
              rounds: null,
            },
          ],
        },
      ],
    })),
  } as AiProvider
}

describe("ai service resilience", () => {
  beforeAll(async () => {
    await assertCatalogSeeded()
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await prisma.user.deleteMany({
      where: { email: { startsWith: PREFIX } },
    })
  })

  it("succeeds without personalization when the history loader throws", async () => {
    const user = await makeUser()
    await seedSquatHistory(user.id)
    const job = await createJob(user.id, INPUT)
    vi.mocked(listRecentExerciseHistory).mockRejectedValueOnce(new Error("db down"))

    await runJob(job.id, validProvider())

    const stored = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })
    const result = stored.result as unknown as AiJobResult
    expect(stored.status).toBe("succeeded")
    expect(result.source).toBe("ai")
    expect(result.personalized).toBe(false)
    expect(result.personalizedCount).toBe(0)
  })

  it("succeeds without personalization when the personalization pass throws", async () => {
    const user = await makeUser()
    await seedSquatHistory(user.id)
    const job = await createJob(user.id, INPUT)
    vi.mocked(personalizeRoutine).mockImplementationOnce(() => {
      throw new Error("boom")
    })

    await runJob(job.id, validProvider())

    const stored = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })
    const result = stored.result as unknown as AiJobResult
    expect(stored.status).toBe("succeeded")
    expect(result.source).toBe("ai")
    expect(result.personalized).toBe(false)
    expect(result.personalizedCount).toBe(0)
  })
})
