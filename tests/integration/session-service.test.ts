import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  abandonSession, completeSession, getActiveSession, getSession, upsertSession,
} from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@session-service-test.local"

async function makeUserWithRoutine() {
  const user = await prisma.user.create({ data: { email: `ss_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
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
  return { user, routine: dto, day: routine.days[0]!, exercise }
}

function makePayload(routine: RoutineDTO, activeSeconds = 0) {
  return toUpsertPayload(buildLocalSession(routine, routine.days[0]!), activeSeconds)
}

describe("session service", () => {
  beforeAll(assertCatalogSeeded)

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("upserts a session with a snapshot and exercises", async () => {
    const { user, routine } = await makeUserWithRoutine()
    const started = await upsertSession(user.id, makePayload(routine))
    expect(started.status).toBe("in_progress")
    const reopened = await getSession(user.id, started.id)
    expect(reopened.exercises).toHaveLength(1)
    expect(reopened.exercises[0]?.nameSnapshot).toBeTruthy()
    expect(await prisma.workoutSession.count({ where: { userId: user.id, status: "in_progress" } })).toBe(1)
  })

  it("seeds the prescribed number of sets (with parsed reps/weight) at start", async () => {
    const { user, routine } = await makeUserWithRoutine()
    const started = await upsertSession(user.id, makePayload(routine))
    const reopened = await getSession(user.id, started.id)
    const sets = reopened.exercises[0]!.sets
    expect(sets).toHaveLength(3)
    expect(sets.map((set) => set.setNumber)).toEqual([1, 2, 3])
    expect(sets.every((set) => set.type === "working")).toBe(true)
    expect(sets.every((set) => set.reps === 10)).toBe(true)
    expect(sets.every((set) => set.weightKg === 40)).toBe(true)
    expect(sets.every((set) => set.completedAt === null)).toBe(true)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: started.id } } })).toBe(3)
  })

  it("freezes names when the routine is edited mid-session", async () => {
    const { user, routine, day, exercise } = await makeUserWithRoutine()
    const started = await upsertSession(user.id, makePayload(routine))
    const originalName = routine.days[0]!.exercises[0]!.exercise!.name
    await prisma.exercise.update({ where: { id: exercise.id }, data: { name: "Renamed Exercise" } })
    await prisma.routineExercise.updateMany({ where: { routineDayId: day.id }, data: { targetSets: 99 } })
    const reopened = await getSession(user.id, started.id)
    const snapshot = reopened.snapshot as { exercises: { name: string; targetSets: number | null }[] }
    expect(reopened.exercises[0]?.nameSnapshot).toBe(originalName)
    expect(snapshot.exercises[0]?.name).toBe(originalName)
    expect(snapshot.exercises[0]?.targetSets).toBe(3)
  })

  it("syncs sets and activeSeconds; complete then rejects further writes", async () => {
    const { user, routine } = await makeUserWithRoutine()
    const payload = makePayload(routine)
    await upsertSession(user.id, payload)
    const updated = await upsertSession(user.id, {
      ...payload,
      activeSeconds: 300,
      exercises: [{
        ...payload.exercises[0]!,
        completed: true,
        notes: "felt good",
        sets: [
          { setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() },
        ],
      }],
    })
    expect(updated.activeSeconds).toBe(300)
    expect(updated).not.toHaveProperty("exercises")
    const reopened = await getSession(user.id, payload.id)
    expect(reopened.exercises[0]?.sets).toHaveLength(1)
    const done = await completeSession(user.id, payload.id, 600)
    expect(done.status).toBe("completed")
    expect(done.activeSeconds).toBe(600)
    await expect(upsertSession(user.id, { ...payload, activeSeconds: 1, exercises: [] })).rejects.toThrow(/not in progress|conflict/i)
    await expect(completeSession(user.id, payload.id, 1)).resolves.toMatchObject({ status: "completed", activeSeconds: 600 })
  })

  it("abandons a session; active lookup returns null; ownership scoped", async () => {
    const { user, routine } = await makeUserWithRoutine()
    const other = await prisma.user.create({ data: { email: `ss2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const payload = makePayload(routine)
    await upsertSession(user.id, payload)
    await expect(getSession(other.id, payload.id)).rejects.toThrow("Session not found")
    await abandonSession(user.id, payload.id)
    expect(await getActiveSession(user.id)).toBeNull()
  })

  it("reports lastPerformance from the most recent completed session", async () => {
    const { user, routine } = await makeUserWithRoutine()
    const first = makePayload(routine, 100)
    await upsertSession(user.id, first)
    await upsertSession(user.id, {
      ...first,
      exercises: [{
        ...first.exercises[0]!,
        completed: true,
        sets: [
          { setNumber: 1, type: "warmup", reps: 12, weightKg: 20, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: new Date().toISOString() },
          { setNumber: 2, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() },
        ],
      }],
    })
    const done = await completeSession(user.id, first.id, 120)
    const second = makePayload(routine)
    await upsertSession(user.id, second)
    const reopened = await getSession(user.id, second.id)
    expect(reopened.exercises[0]?.lastPerformance).toEqual({ reps: 8, weightKg: 40, date: done.completedAt })
  })

  it("persists swap provenance when an exercise is replaced", async () => {
    const { user, routine, exercise } = await makeUserWithRoutine()
    const substitute = await prisma.exercise.findFirstOrThrow({
      where: { id: { not: exercise.id } },
      select: { id: true, name: true },
    })
    const payload = makePayload(routine, 30)
    await upsertSession(user.id, payload)
    await upsertSession(user.id, {
      ...payload,
      exercises: [{
        ...payload.exercises[0]!,
        exerciseId: substitute.id,
        nameSnapshot: substitute.name,
        swappedFromId: exercise.id,
        sets: [],
      }],
    })
    const reopened = await getSession(user.id, payload.id)
    expect(reopened.exercises[0]?.exerciseId).toBe(substitute.id)
    expect(reopened.exercises[0]?.nameSnapshot).toBe(substitute.name)
    expect(reopened.exercises[0]?.swappedFromId).toBe(exercise.id)
  })
})
