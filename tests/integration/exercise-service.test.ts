import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listExercises } from "@/server/services/exercise.service"

const TEST_MUSCLE = "T_chest"

// `_` is a single-character wildcard in SQL `LIKE`, so a `startsWith("T_")`
// cleanup would also delete other suites' `Test_*` fixtures. Delete by explicit
// source ids instead so test files stay isolated.
const FIXTURES = [
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
  {
    sourceId: "T_DupeA",
    name: "T Duplicate",
    primaryMuscles: ["T_dupe"],
    equipment: "dumbbell",
    images: [],
  },
  {
    sourceId: "T_DupeB",
    name: "T Duplicate",
    primaryMuscles: ["T_dupe"],
    equipment: "dumbbell",
    images: [],
  },
]

describe("listExercises", () => {
  beforeAll(async () => {
    await prisma.exercise.createMany({ data: FIXTURES, skipDuplicates: true })
  })

  afterAll(async () => {
    await prisma.exercise.deleteMany({
      where: { sourceId: { in: FIXTURES.map((f) => f.sourceId) } },
    })
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

  it("pages deterministically across duplicate names without skips or duplicates", async () => {
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await listExercises({ limit: 1, muscle: "T_dupe", cursor })
      expect(page.items).toHaveLength(1)
      seen.push(...page.items.map((item) => item.sourceId))
      cursor = page.nextCursor ?? undefined
    } while (cursor)

    expect([...seen].sort()).toEqual(["T_DupeA", "T_DupeB"])
    expect(new Set(seen).size).toBe(seen.length)
  })
})
