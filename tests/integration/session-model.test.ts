import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"

const DOMAIN = "@session-model-test.local"

describe("session model", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("creates a session with exercises and sets and cascades on delete", async () => {
    const user = await prisma.user.create({ data: { email: `sm_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true } })
    const session = await prisma.workoutSession.create({
      data: {
        userId: user.id, name: "Push", status: "in_progress",
        snapshot: { routineDayId: "rd1", exercises: [{ order: 0 }] },
        exercises: {
          create: [{
            exerciseId: exercise.id, order: 0, nameSnapshot: exercise.name, targetSets: 3, targetReps: "10", restSeconds: 60,
            sets: { create: [{ setNumber: 1, type: "warmup", reps: 10, weightKg: 20 }, { setNumber: 2, type: "working", reps: 8, weightKg: 40, rpe: 8 }] },
          }],
        },
      },
      include: { exercises: { include: { sets: true } } },
    })
    expect(session.status).toBe("in_progress")
    expect(session.exercises[0]?.sets).toHaveLength(2)
    expect(session.snapshot).toEqual({ routineDayId: "rd1", exercises: [{ order: 0 }] })

    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.sessionExercise.count({ where: { sessionId: session.id } })).toBe(0)
    expect(await prisma.setLog.count({ where: { sessionExerciseId: session.exercises[0]!.id } })).toBe(0)
  })
})
