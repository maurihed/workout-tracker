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
    const inWindow = new Date(Date.now() - 10 * 86_400_000)
    const outOfWindow = new Date(Date.now() - 200 * 86_400_000)

    await seedSession(user.id, exercise.id, outOfWindow, 500, 1)

    await prisma.workoutSession.create({
      data: {
        userId: user.id,
        name: "s",
        status: "completed",
        completedAt: inWindow,
        snapshot: {},
        exercises: {
          create: [
            {
              exerciseId: exercise.id,
              order: 0,
              nameSnapshot: "Barbell Full Squat",
              completed: true,
              sets: {
                create: [
                  { setNumber: 1, type: "working", weightKg: 100, reps: 5, completedAt: inWindow },
                  { setNumber: 2, type: "warmup", weightKg: 200, reps: 3, completedAt: inWindow },
                  { setNumber: 3, type: "working", weightKg: 150, reps: 8, completedAt: null },
                ],
              },
            },
            {
              exerciseId: exercise.id,
              order: 1,
              nameSnapshot: "Barbell Full Squat",
              completed: false,
              skipped: true,
              sets: {
                create: {
                  setNumber: 1,
                  type: "working",
                  weightKg: 300,
                  reps: 2,
                  completedAt: inWindow,
                },
              },
            },
          ],
        },
      },
    })

    const rows = await listRecentExerciseHistory(user.id, {
      since: new Date(Date.now() - 84 * 86_400_000),
      maxSessions: 60,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.exercises).toHaveLength(1)
    expect(rows[0]?.exercises[0]?.sets).toEqual([{ weightKg: 100, reps: 5 }])
  })
})
