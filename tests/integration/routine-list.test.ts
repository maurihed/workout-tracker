import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listByUser } from "@/server/repositories/routine.repository"

const DOMAIN = "@routine-list-test.local"

async function makeUser() {
  return prisma.user.create({ data: { email: `rl_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
}

describe("routine.repository.listByUser", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("returns summaries with day and exercise counts, newest first", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true } })
    await prisma.routine.create({
      data: {
        userId: user.id, name: "A", source: "manual", isActive: false,
        days: { create: [{ weekday: 1, label: null, order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } }] },
      },
    })
    const rows = await listByUser(user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: "A", dayCount: 1, exerciseCount: 1 })
  })

  it("rejects two days on the same weekday", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true } })
    await expect(
      prisma.routine.create({
        data: {
          userId: user.id, name: "Dup", source: "manual",
          days: { create: [
            { weekday: 1, order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } },
            { weekday: 1, order: 1, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } },
          ] },
        },
      }),
    ).rejects.toThrow()
  })
})
