import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { recomputeUserStats, markPersonalRecords } from "@/server/services/stats.service"
import { upsertSession } from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@stats-engine-test.local"

async function makeUser(routineWeekdays: number[] = [1]) {
  const user = await prisma.user.create({ data: { email: `st_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: { timezone: "UTC", weekStartsOn: 1, daysPerWeek: 3 } } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true, images: true } })
  const routine = await prisma.routine.create({
    data: { userId: user.id, name: "Push", source: "manual", isActive: true, days: { create: routineWeekdays.map((weekday, i) => ({ weekday, label: `D${i}`, order: i, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 2, targetReps: "5", targetWeightKg: 100, restSeconds: 60 }] } })) } },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  })
  const dto: RoutineDTO = {
    id: routine.id, name: "Push", nameEs: null, description: null, descriptionEs: null, goal: null, source: "manual", isActive: true,
    days: routine.days.map((d) => ({ id: d.id, weekday: d.weekday, label: d.label, order: d.order, exercises: d.exercises.map((re) => ({ id: re.id, order: re.order, exerciseId: re.exerciseId, customName: re.customName, targetSets: re.targetSets, targetReps: re.targetReps, restSeconds: re.restSeconds, targetWeightKg: re.targetWeightKg, setTargets: null, timerType: re.timerType, workSeconds: re.workSeconds, rounds: re.rounds, notes: re.notes, exercise: re.exercise ? { id: re.exercise.id, name: re.exercise.name, nameEs: re.exercise.nameEs, images: re.exercise.images } : null })) })),
  }
  return { user, routine: dto, day: dto.days[0]!, exercise }
}

async function complete(userId: string, routine: RoutineDTO, dayIndex: number, completedAt: Date) {
  const local = buildLocalSession(routine, routine.days[dayIndex]!)
  await upsertSession(userId, toUpsertPayload(local, 300))
  await prisma.workoutSession.update({ where: { id: local.source.id }, data: { status: "completed", completedAt } })
  await prisma.setLog.updateMany({ where: { sessionExercise: { sessionId: local.source.id } }, data: { completedAt } })
  await markPersonalRecords(userId, local.source.id)
  return local.source.id
}

describe("stats engine", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("recomputes totals, XP, and level from completed sessions", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date())
    const { stats } = await recomputeUserStats(user.id)
    expect(stats.totalSessions).toBe(1)
    expect(stats.totalVolumeKg).toBeGreaterThan(0)
    expect(stats.xp).toBeGreaterThanOrEqual(100)
    expect(stats.level).toBeGreaterThanOrEqual(2)
    expect(stats.currentStreak).toBe(1)
  })

  it("is idempotent on replay (no duplicate XP)", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date())
    const first = await recomputeUserStats(user.id)
    const second = await recomputeUserStats(user.id)
    expect(second.stats.xp).toBe(first.stats.xp)
    expect(await prisma.xpEvent.count({ where: { userId: user.id } })).toBe(await prisma.xpEvent.count({ where: { userId: user.id, key: { not: "" } } }))
  })

  it("marks at most one PR per exercise per session and first-ever counts", async () => {
    const { user, routine } = await makeUser()
    const sessionId = await complete(user.id, routine, 0, new Date())
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId }, isPr: true } })).toBe(1)
  })

  it("repairs drift", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date())
    await prisma.userStats.upsert({ where: { userId: user.id }, create: { userId: user.id, xp: 999999, level: 99, totalSessions: 99 }, update: { xp: 999999, level: 99, totalSessions: 99 } })
    const { stats } = await recomputeUserStats(user.id)
    expect(stats.totalSessions).toBe(1)
    expect(stats.level).toBeLessThan(99)
  })
})
