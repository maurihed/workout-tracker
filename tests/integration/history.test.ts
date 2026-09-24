import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listHistory } from "@/server/services/history.service"
import { upsertSession } from "@/server/services/session.service"
import { markPersonalRecords } from "@/server/services/stats.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@history-test.local"

async function makeUser(routineWeekdays: number[] = [1]) {
  const user = await prisma.user.create({ data: { email: `hi_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: { timezone: "UTC", weekStartsOn: 1, daysPerWeek: 3 } } } })
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

describe("history", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("lists completed sessions newest-first and paginates", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-01-06T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-01-07T10:00:00Z"))
    const page1 = await listHistory(user.id, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0]?.completedAt).toBe("2026-01-07T10:00:00.000Z")
    expect(page1.nextCursor).toBeTruthy()
    const page2 = await listHistory(user.id, { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()
  })

  it("filters by date range and routine, and is ownership-scoped", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-02-05T10:00:00Z"))
    const jan = await listHistory(user.id, { limit: 20, from: "2026-01-01", to: "2026-01-31" })
    expect(jan.items).toHaveLength(1)
    const other = await prisma.user.create({ data: { email: `h2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    expect((await listHistory(other.id, { limit: 20 })).items).toHaveLength(0)
  })
})
