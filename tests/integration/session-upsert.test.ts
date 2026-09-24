import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  abandonSession, completeSession, getSession, upsertSession,
} from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@session-upsert-test.local"

async function makeRoutine(): Promise<{ userId: string; routine: RoutineDTO }> {
  const user = await prisma.user.create({ data: { email: `su_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true, images: true } })
  const routine = await prisma.routine.create({
    data: {
      userId: user.id, name: "Push", source: "manual", isActive: true,
      days: { create: [{ weekday: 1, label: "Push", order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", targetWeightKg: 40, restSeconds: 90 }] } }] },
    },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  })
  const dto: RoutineDTO = {
    id: routine.id, name: "Push", nameEs: null, description: null, descriptionEs: null,
    goal: null, source: "manual", isActive: true,
    days: routine.days.map((day) => ({
      id: day.id, weekday: day.weekday, label: day.label, order: day.order,
      exercises: day.exercises.map((re) => ({
        id: re.id, order: re.order, exerciseId: re.exerciseId, customName: re.customName,
        targetSets: re.targetSets, targetReps: re.targetReps, restSeconds: re.restSeconds,
        targetWeightKg: re.targetWeightKg, setTargets: null, timerType: re.timerType, workSeconds: re.workSeconds,
        rounds: re.rounds, notes: re.notes,
        exercise: re.exercise ? { id: re.exercise.id, name: re.exercise.name, nameEs: re.exercise.nameEs, images: re.exercise.images } : null,
      })),
    })),
  }
  return { userId: user.id, routine: dto }
}

function payloadFor(routine: RoutineDTO, activeSeconds = 0) {
  const local = buildLocalSession(routine, routine.days[0]!)
  return toUpsertPayload(local, activeSeconds)
}

describe("session upsert", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("creates a session from a client payload and replays idempotently", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    const ack = await upsertSession(userId, payload)
    expect(ack.status).toBe("in_progress")
    expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
    expect(await prisma.sessionExercise.count({ where: { sessionId: payload.id } })).toBe(1)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: payload.id } } })).toBe(3)

    const replay = await upsertSession(userId, payload)
    expect(replay.id).toBe(payload.id)
    expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: payload.id } } })).toBe(3)
  })

  it("abandons a conflicting in-progress session on create", async () => {
    const { userId, routine } = await makeRoutine()
    const first = payloadFor(routine)
    await upsertSession(userId, first)
    const second = payloadFor(routine)
    await upsertSession(userId, second)
    expect(await prisma.workoutSession.count({ where: { userId, status: "in_progress" } })).toBe(1)
    expect(await prisma.workoutSession.count({ where: { userId, status: "abandoned" } })).toBe(1)
  })

  it("edits sets by id without churning row ids", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    const setId = payload.exercises[0]!.sets[0]!.id!
    const edited = { ...payload, exercises: [{ ...payload.exercises[0]!, sets: payload.exercises[0]!.sets.slice(0, 1).map((s) => ({ ...s, reps: 5, completedAt: new Date().toISOString() })) }] }
    await upsertSession(userId, edited)
    const rows = await prisma.setLog.findMany({ where: { sessionExercise: { sessionId: payload.id } } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(setId)
    expect(rows[0]?.reps).toBe(5)
  })

  it("keeps the client id of a set added mid-session across replays", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    const newSetId = crypto.randomUUID()
    const added = {
      ...payload,
      exercises: [{
        ...payload.exercises[0]!,
        sets: [
          ...payload.exercises[0]!.sets,
          { ...payload.exercises[0]!.sets[0]!, id: newSetId, setNumber: 4, reps: 8 },
        ],
      }],
    }
    await upsertSession(userId, added)
    await upsertSession(userId, added)
    const rows = await prisma.setLog.findMany({
      where: { sessionExercise: { sessionId: payload.id } },
      select: { id: true },
      orderBy: { setNumber: "asc" },
    })
    expect(rows).toHaveLength(4)
    expect(rows[3]?.id).toBe(newSetId)
  })

  it("is idempotent on complete and abandon; rejects a write after completion", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine, 120)
    await upsertSession(userId, payload)
    const done = await completeSession(userId, payload.id, 300)
    expect(done.status).toBe("completed")
    expect((await completeSession(userId, payload.id, 999)).activeSeconds).toBe(300)
    await expect(upsertSession(userId, payload)).rejects.toThrow(/not in progress/i)
    await expect(abandonSession(userId, payload.id)).rejects.toThrow(/not in progress/i)
  })

  it("is idempotent on abandon", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    await abandonSession(userId, payload.id)
    await expect(abandonSession(userId, payload.id)).resolves.toBeUndefined()
    expect(await prisma.workoutSession.count({ where: { userId, status: "abandoned" } })).toBe(1)
  })

  it("scopes ownership and validates the routine day", async () => {
    const { userId, routine } = await makeRoutine()
    const other = await prisma.user.create({ data: { email: `su2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    await expect(getSession(other.id, payload.id)).rejects.toThrow("Session not found")
    const bad = { ...payloadFor(routine), routineDayId: "missing-day" }
    await expect(upsertSession(other.id, bad)).rejects.toThrow(/Routine day not found/i)
  })

  it("persists degenerate payloads (no sets, skipped, range reps, weight 0, long note)", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    const degenerate = {
      ...payload,
      exercises: [{
        ...payload.exercises[0]!,
        skipped: true,
        completed: false,
        notes: "x".repeat(500),
        sets: [],
      }],
    }
    await upsertSession(userId, degenerate)
    const reopened = await getSession(userId, payload.id)
    expect(reopened.exercises[0]?.skipped).toBe(true)
    expect(reopened.exercises[0]?.sets).toHaveLength(0)
    expect(reopened.exercises[0]?.notes).toHaveLength(500)
  })

  it("does not overwrite a set owned by another session", async () => {
    const { userId, routine } = await makeRoutine()
    const first = payloadFor(routine)
    await upsertSession(userId, first)
    const foreignSetId = first.exercises[0]!.sets[0]!.id!
    const before = await prisma.setLog.findUniqueOrThrow({
      where: { id: foreignSetId },
      select: { reps: true, weightKg: true },
    })

    const second = payloadFor(routine)
    await upsertSession(userId, second)
    await upsertSession(userId, {
      ...second,
      exercises: [{
        ...second.exercises[0]!,
        sets: [{ ...second.exercises[0]!.sets[0]!, id: foreignSetId, reps: 999, weightKg: 999 }],
      }],
    })

    const after = await prisma.setLog.findUniqueOrThrow({
      where: { id: foreignSetId },
      select: { reps: true, weightKg: true, sessionExercise: { select: { sessionId: true } } },
    })
    expect(after.reps).toBe(before.reps)
    expect(after.weightKg).toBe(before.weightKg)
    expect(after.sessionExercise.sessionId).toBe(first.id)

    const secondSets = await prisma.setLog.findMany({
      where: { sessionExercise: { sessionId: second.id } },
      select: { id: true },
    })
    expect(secondSets).toHaveLength(1)
    expect(secondSets[0]?.id).not.toBe(foreignSetId)
  })
})
