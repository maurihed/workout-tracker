import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  activateRoutine, createBlankRoutine, deleteRoutine, duplicateRoutine,
  getRoutine, listRoutines, replaceRoutine,
} from "@/server/services/routine.service"

const DOMAIN = "@routine-crud-test.local"
const input = {
  name: "Edited",
  description: null,
  goal: null,
  days: [
    { weekday: 1, label: "Push", exercises: [{ exerciseId: "", targetSets: 4, targetReps: "6-8", restSeconds: 120, targetWeightKg: null, timerType: "none" as const, workSeconds: null, rounds: null, notes: null }] },
  ],
}

async function makeUser() {
  return prisma.user.create({ data: { email: `rc_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
}
async function firstExerciseId() {
  return (await prisma.exercise.findFirstOrThrow({ select: { id: true } })).id
}

describe("routine service CRUD", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("creates a blank inactive routine and lists it", async () => {
    const user = await makeUser()
    const routine = await createBlankRoutine(user.id, { name: "Blank", description: null, goal: null })
    expect(routine.isActive).toBe(false)
    expect(routine.days).toHaveLength(0)
    const list = await listRoutines(user.id)
    expect(list.map((r) => r.id)).toContain(routine.id)
  })

  it("replaces days atomically and keeps only one active routine", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    const b = await createBlankRoutine(user.id, { name: "B", description: null, goal: null })
    await replaceRoutine(user.id, a.id, { ...input, days: [{ ...input.days[0]!, exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId }] }] })
    await activateRoutine(user.id, a.id)
    await activateRoutine(user.id, b.id)
    const active = await prisma.routine.count({ where: { userId: user.id, isActive: true } })
    expect(active).toBe(1)
    const fetched = await getRoutine(user.id, a.id)
    expect(fetched.name).toBe("Edited")
    expect(fetched.days[0]?.exercises).toHaveLength(1)
  })

  it("rejects duplicate weekdays without partial write", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    const dup = { ...input, days: [
      { ...input.days[0]!, exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId }] },
      { ...input.days[0]!, label: "Push 2", exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId }] },
    ] }
    await expect(replaceRoutine(user.id, a.id, dup)).rejects.toThrow()
    expect((await getRoutine(user.id, a.id)).days).toHaveLength(0)
  })

  it("replaces existing days on re-edit instead of appending", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    await replaceRoutine(user.id, a.id, { ...input, days: [{ ...input.days[0]!, exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId }] }] })
    const second = {
      name: "Edited Again",
      description: null,
      goal: null,
      days: [
        { weekday: 1, label: "Pull", exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId, targetSets: 5 }] },
        { weekday: 3, label: "Legs", exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId, targetReps: "8-10" }] },
      ],
    }
    const result = await replaceRoutine(user.id, a.id, second)
    expect(result.name).toBe("Edited Again")
    expect(result.days).toHaveLength(2)
    expect(result.days.map((d) => d.weekday).sort()).toEqual([1, 3])
    const day1 = result.days.find((d) => d.weekday === 1)
    expect(day1?.label).toBe("Pull")
    expect(day1?.exercises).toHaveLength(1)
    expect(day1?.exercises[0]?.targetSets).toBe(5)
    expect(await prisma.routineDay.count({ where: { routineId: a.id } })).toBe(2)
    expect(await prisma.routineExercise.count({ where: { routineDay: { routineId: a.id } } })).toBe(2)
  })

  it("scopes by owner (404 for another user)", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const routine = await createBlankRoutine(owner.id, { name: "Mine", description: null, goal: null })
    await expect(getRoutine(other.id, routine.id)).rejects.toThrow("Routine not found")
    await expect(deleteRoutine(other.id, routine.id)).rejects.toThrow("Routine not found")
    expect(await prisma.routine.count({ where: { id: routine.id } })).toBe(1)
  })

  it("duplicates days+exercises independently and delete leaves no active routine", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    await replaceRoutine(user.id, a.id, { ...input, days: [{ ...input.days[0]!, exercises: [{ ...input.days[0]!.exercises[0]!, exerciseId }] }] })
    await activateRoutine(user.id, a.id)
    const copy = await duplicateRoutine(user.id, a.id, "en")
    expect(copy.name).toBe("Edited (copy)")
    expect(copy.isActive).toBe(false)
    expect(copy.days[0]?.exercises).toHaveLength(1)
    await deleteRoutine(user.id, a.id)
    expect(await prisma.routine.count({ where: { userId: user.id, isActive: true } })).toBe(0)
    expect(await prisma.routine.count({ where: { id: copy.id } })).toBe(1)
  })
})
