import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listExercises } from "@/server/services/exercise.service"

const TEST_MUSCLE = "T_chest"

describe("listExercises", () => {
  beforeAll(async () => {
    await prisma.exercise.createMany({
      data: [
        {
          sourceId: "T_Alpha",
          name: "Alpha Press",
          primaryMuscles: [TEST_MUSCLE],
          equipment: "barbell",
          images: [],
        },
        {
          sourceId: "T_Beta",
          name: "Beta Row",
          primaryMuscles: [TEST_MUSCLE],
          equipment: "dumbbell",
          images: [],
        },
        {
          sourceId: "T_Gamma",
          name: "Gamma Curl",
          primaryMuscles: [TEST_MUSCLE],
          equipment: "dumbbell",
          images: [],
        },
      ],
      skipDuplicates: true,
    })
  })

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { sourceId: { startsWith: "T_" } } })
  })

  it("filters by muscle and paginates with a cursor", async () => {
    const first = await listExercises({ limit: 2, muscle: TEST_MUSCLE })
    expect(first.items.map((item) => item.name)).toEqual(["Alpha Press", "Beta Row"])
    expect(first.nextCursor).toBe(first.items[1]?.id)

    const second = await listExercises({
      limit: 2,
      muscle: TEST_MUSCLE,
      cursor: first.nextCursor ?? undefined,
    })
    expect(second.items.map((item) => item.name)).toEqual(["Gamma Curl"])
    expect(second.nextCursor).toBeNull()
  })

  it("searches names case-insensitively", async () => {
    const page = await listExercises({ limit: 20, muscle: TEST_MUSCLE, q: "beta" })
    expect(page.items.map((item) => item.name)).toEqual(["Beta Row"])
  })
})
