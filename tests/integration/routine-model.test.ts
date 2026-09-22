import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/prisma"

describe("routine model", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@routine-model-test.local" } },
    })
  })

  it("creates a routine with nested days/exercises and cascades on delete", async () => {
    const user = await prisma.user.create({
      data: { email: `rm_${Date.now()}@routine-model-test.local` },
    })
    const exercise = await prisma.exercise.findFirst({ select: { id: true } })
    expect(exercise).not.toBeNull()

    const routine = await prisma.routine.create({
      data: {
        userId: user.id,
        name: "Test Routine",
        source: "template",
        isActive: true,
        days: {
          create: [
            {
              weekday: 1,
              label: "Day A",
              order: 0,
              exercises: {
                create: [
                  {
                    exerciseId: exercise!.id,
                    order: 0,
                    targetSets: 3,
                    targetReps: "8-12",
                  },
                ],
              },
            },
          ],
        },
      },
      include: { days: { include: { exercises: true } } },
    })

    expect(routine.days).toHaveLength(1)
    expect(routine.days[0]?.exercises).toHaveLength(1)

    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.routine.count({ where: { userId: user.id } })).toBe(0)
    expect(
      await prisma.routineDay.count({ where: { routineId: routine.id } }),
    ).toBe(0)
    expect(
      await prisma.routineExercise.count({
        where: { routineDayId: routine.days[0]!.id },
      }),
    ).toBe(0)
  })

  it("persists the new Profile fields", async () => {
    const user = await prisma.user.create({
      data: {
        email: `rm2_${Date.now()}@routine-model-test.local`,
        profile: {
          create: { location: "home", equipment: ["dumbbell", "body only"] },
        },
      },
      include: { profile: true },
    })
    expect(user.profile?.location).toBe("home")
    expect(user.profile?.equipment).toEqual(["dumbbell", "body only"])
  })
})
