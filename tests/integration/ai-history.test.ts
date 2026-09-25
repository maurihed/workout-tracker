import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listRecentExerciseHistory } from "@/server/repositories/ai.repository"
import { assertCatalogSeeded } from "./helpers/catalog"

const PREFIX = "ai_history_it_"

async function makeUser() {
  return prisma.user.create({
    data: { email: `${PREFIX}${Date.now()}${Math.random()}@e2e-test.local`, profile: { create: {} } },
  })
}

async function seedSession(userId: string, exerciseId: string, completedAt: Date, weightKg: number, reps: number) {
  return prisma.workoutSession.create({
    data: {
      userId,
      name: "s",
      status: "completed",
      completedAt,
      snapshot: {},
      exercises: {
        create: {
          exerciseId,
          order: 0,
          nameSnapshot: "Barbell Full Squat",
          completed: true,
          sets: { create: { setNumber: 1, type: "working", weightKg, reps, completedAt } },
        },
      },
    },
  })
}

describe("listRecentExerciseHistory", () => {
  beforeAll(assertCatalogSeeded)
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it("returns only completed working sets within the window", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ where: { sourceId: "Barbell_Full_Squat" } })
    await seedSession(user.id, exercise.id, new Date("2026-09-20T10:00:00Z"), 100, 5)
    await seedSession(user.id, exercise.id, new Date("2020-01-01T10:00:00Z"), 500, 1)

    const rows = await listRecentExerciseHistory(user.id, {
      since: new Date(Date.now() - 84 * 86_400_000),
      maxSessions: 60,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.exercises[0]?.sets).toEqual([{ weightKg: 100, reps: 5 }])
  })
})
