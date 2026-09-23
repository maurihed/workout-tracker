import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  abandonSession, completeSession, getActiveSession, getSession,
  replaceSessionState, startSession,
} from "@/server/services/session.service"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@session-service-test.local"

async function makeUserWithRoutine() {
  const user = await prisma.user.create({ data: { email: `ss_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true } })
  const routine = await prisma.routine.create({
    data: {
      userId: user.id, name: "Push", source: "manual", isActive: true,
      days: { create: [{ weekday: 1, label: "Push", order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", targetWeightKg: 40, restSeconds: 90 }] } }] },
    },
    include: { days: true },
  })
  return { user, routine, day: routine.days[0]!, exercise }
}

describe("session service", () => {
  beforeAll(assertCatalogSeeded)

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("starts a session with a snapshot and exercises; second start conflicts", async () => {
    const { user, day } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    expect(started.status).toBe("in_progress")
    expect(started.exercises).toHaveLength(1)
    expect(started.exercises[0]?.nameSnapshot).toBeTruthy()
    await expect(startSession(user.id, day.id)).rejects.toThrow(/in progress/i)
    expect(await prisma.workoutSession.count({ where: { userId: user.id, status: "in_progress" } })).toBe(1)
  })

  it("seeds the prescribed number of sets (with parsed reps/weight) at start", async () => {
    const { user, day } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    const sets = started.exercises[0]!.sets
    expect(sets).toHaveLength(3)
    expect(sets.map((set) => set.setNumber)).toEqual([1, 2, 3])
    expect(sets.every((set) => set.type === "working")).toBe(true)
    expect(sets.every((set) => set.reps === 10)).toBe(true)
    expect(sets.every((set) => set.weightKg === 40)).toBe(true)
    expect(sets.every((set) => set.completedAt === null)).toBe(true)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: started.id } } })).toBe(3)
  })

  it("freezes names when the routine is edited mid-session", async () => {
    const { user, day, exercise } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    const originalName = started.exercises[0]?.nameSnapshot
    // edit the routine's exercise name source (rename the exercise) and the routine day
    await prisma.exercise.update({ where: { id: exercise.id }, data: { name: "Renamed Exercise" } })
    await prisma.routineExercise.updateMany({ where: { routineDayId: day.id }, data: { targetSets: 99 } })
    const reopened = await getSession(user.id, started.id)
    expect(reopened.exercises[0]?.nameSnapshot).toBe(originalName)
    expect(reopened.exercises[0]?.targetSets).toBe(3)
  })

  it("replaces sets and reflects activeSeconds; complete then rejects further writes", async () => {
    const { user, day } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    const seId = started.exercises[0]!.id
    const updated = await replaceSessionState(user.id, started.id, {
      activeSeconds: 300,
      exercises: [{ id: seId, exerciseId: started.exercises[0]!.exercise!.id, nameSnapshot: started.exercises[0]!.nameSnapshot, swappedFromId: null, completed: true, skipped: false, notes: "felt good", sets: [
        { setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() },
      ] }],
    })
    // The write response is a lean ack: it must not carry exercises/lastPerformance.
    expect(updated.activeSeconds).toBe(300)
    expect(updated).not.toHaveProperty("exercises")
    const reopened = await getSession(user.id, started.id)
    expect(reopened.exercises[0]?.sets).toHaveLength(1)
    const done = await completeSession(user.id, started.id, 600)
    expect(done.status).toBe("completed")
    expect(done.activeSeconds).toBe(600)
    await expect(replaceSessionState(user.id, started.id, { activeSeconds: 1, exercises: [] })).rejects.toThrow(/not in progress|conflict/i)
    await expect(completeSession(user.id, started.id, 1)).rejects.toThrow(/not in progress|conflict/i)
  })

  it("abandons a session; active lookup returns null; ownership scoped", async () => {
    const { user, day } = await makeUserWithRoutine()
    const other = await prisma.user.create({ data: { email: `ss2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const started = await startSession(user.id, day.id)
    await expect(getSession(other.id, started.id)).rejects.toThrow("Session not found")
    await abandonSession(user.id, started.id)
    expect(await getActiveSession(user.id)).toBeNull()
  })

  it("reports lastPerformance from the most recent completed session", async () => {
    const { user, day } = await makeUserWithRoutine()
    const first = await startSession(user.id, day.id)
    const seId = first.exercises[0]!.id
    await replaceSessionState(user.id, first.id, {
      activeSeconds: 100,
      exercises: [{ id: seId, exerciseId: first.exercises[0]!.exercise!.id, nameSnapshot: first.exercises[0]!.nameSnapshot, swappedFromId: null, completed: true, skipped: false, notes: null, sets: [
        { setNumber: 1, type: "warmup", reps: 12, weightKg: 20, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: new Date().toISOString() },
        { setNumber: 2, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() },
      ] }],
    })
    const done = await completeSession(user.id, first.id, 120)
    const second = await startSession(user.id, day.id)
    const reopened = await getSession(user.id, second.id)
    expect(reopened.exercises[0]?.lastPerformance).toEqual({ reps: 8, weightKg: 40, date: done.completedAt })
  })

  it("persists swap provenance when an exercise is replaced", async () => {
    const { user, day, exercise } = await makeUserWithRoutine()
    const substitute = await prisma.exercise.findFirstOrThrow({
      where: { id: { not: exercise.id } },
      select: { id: true, name: true },
    })
    const started = await startSession(user.id, day.id)
    const seId = started.exercises[0]!.id
    await replaceSessionState(user.id, started.id, {
      activeSeconds: 30,
      exercises: [{
        id: seId, exerciseId: substitute.id, nameSnapshot: substitute.name, swappedFromId: exercise.id,
        completed: false, skipped: false, notes: null, sets: [],
      }],
    })
    const reopened = await getSession(user.id, started.id)
    expect(reopened.exercises[0]?.exerciseId).toBe(substitute.id)
    expect(reopened.exercises[0]?.nameSnapshot).toBe(substitute.name)
    expect(reopened.exercises[0]?.swappedFromId).toBe(exercise.id)
  })
})
