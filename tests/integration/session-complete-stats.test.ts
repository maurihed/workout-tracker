import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { completeSession, upsertSession } from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@session-complete-stats.local"

async function makeUser() {
  const user = await prisma.user.create({ data: { email: `sc_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: { timezone: "UTC", weekStartsOn: 1, daysPerWeek: 3 } } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true, images: true } })
  const routine = await prisma.routine.create({
    data: { userId: user.id, name: "Push", source: "manual", isActive: true, days: { create: [{ weekday: 1, label: "D0", order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 2, targetReps: "5", targetWeightKg: 100, restSeconds: 60 }] } }] } },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  })
  const dto: RoutineDTO = {
    id: routine.id, name: "Push", nameEs: null, description: null, descriptionEs: null, goal: null, source: "manual", isActive: true,
    days: routine.days.map((d) => ({ id: d.id, weekday: d.weekday, label: d.label, order: d.order, exercises: d.exercises.map((re) => ({ id: re.id, order: re.order, exerciseId: re.exerciseId, customName: re.customName, targetSets: re.targetSets, targetReps: re.targetReps, restSeconds: re.restSeconds, targetWeightKg: re.targetWeightKg, setTargets: null, timerType: re.timerType, workSeconds: re.workSeconds, rounds: re.rounds, notes: re.notes, exercise: re.exercise ? { id: re.exercise.id, name: re.exercise.name, nameEs: re.exercise.nameEs, images: re.exercise.images } : null })) })),
  }
  return { user, routine: dto }
}

describe("completeSession stats", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("returns a celebration with XP gained and any unlocked badge", async () => {
    const { user, routine } = await makeUser()
    const local = buildLocalSession(routine, routine.days[0]!)
    await upsertSession(user.id, toUpsertPayload(local, 300))
    const result = await completeSession(user.id, local.source.id, 300)
    expect(result.celebration.xpGained).toBeGreaterThanOrEqual(100)
    expect(result.celebration.level).toBeGreaterThanOrEqual(2)
    expect(result.celebration.unlocked.map((a) => a.slug)).toContain("first_workout")
  })

  it("returns an empty celebration on replay", async () => {
    const { user, routine } = await makeUser()
    const local = buildLocalSession(routine, routine.days[0]!)
    await upsertSession(user.id, toUpsertPayload(local, 300))
    await completeSession(user.id, local.source.id, 300)
    const replay = await completeSession(user.id, local.source.id, 300)
    expect(replay.celebration).toEqual({ xpGained: 0, level: replay.celebration.level, leveledUp: false, unlocked: [] })
  })
})
