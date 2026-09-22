import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { importExercises, type RawExercise } from "../../prisma/seed/exercises"

const SAMPLE: RawExercise[] = [
  {
    id: "Test_Curl",
    name: "Test Curl",
    force: "pull",
    level: "beginner",
    mechanic: "isolation",
    equipment: "dumbbell",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    instructions: ["Curl it."],
    category: "strength",
    images: ["Test_Curl/0.jpg"],
  },
]

describe("importExercises", () => {
  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { sourceId: { startsWith: "Test_" } } })
  })

  it("is idempotent across re-runs", async () => {
    const first = await importExercises(prisma, SAMPLE)
    expect(first.created).toBe(1)
    const second = await importExercises(prisma, SAMPLE)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    const count = await prisma.exercise.count({
      where: { sourceId: "Test_Curl" },
    })
    expect(count).toBe(1)
  })
})
