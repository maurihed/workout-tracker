import { describe, expect, it } from "vitest"
import {
  generatedRoutineSchema,
  type AiJobInput,
  type GeneratedRoutine,
} from "@/features/ai/lib/contract"
import { buildCatalogIndex, type CatalogEntry } from "@/features/ai/lib/resolve-exercises"
import { buildFallbackRoutine } from "@/features/ai/lib/template-fallback"

const CATALOG: CatalogEntry[] = [
  { id: "e-pushups", sourceId: "Pushups", name: "Pushups" },
  { id: "e-squat", sourceId: "Bodyweight_Squat", name: "Bodyweight Squat" },
  { id: "e-plank", sourceId: "Plank", name: "Plank" },
  { id: "e-barbell-squat", sourceId: "Barbell_Full_Squat", name: "Barbell Full Squat" },
  { id: "e-deadlift", sourceId: "Barbell_Deadlift", name: "Barbell Deadlift" },
]

const catalog = buildCatalogIndex(CATALOG)

function input(overrides: Partial<AiJobInput> = {}): AiJobInput {
  return {
    goal: "general_fitness",
    experience: "beginner",
    equipment: ["body only"],
    daysPerWeek: 3,
    personalize: true,
    ...overrides,
  }
}

function knownSourceIds(index: ReturnType<typeof buildCatalogIndex>): Set<string> {
  return new Set(index.all.map((entry) => entry.sourceId))
}

function expectSchemaValid(routine: GeneratedRoutine): void {
  expect(() => generatedRoutineSchema.parse(routine)).not.toThrow()
}

function expectRealCatalogReferences(routine: GeneratedRoutine, index: ReturnType<typeof buildCatalogIndex>): void {
  const known = knownSourceIds(index)
  for (const day of routine.days) {
    for (const exercise of day.exercises) {
      if (exercise.sourceId != null) {
        expect(known.has(exercise.sourceId)).toBe(true)
      } else {
        expect((exercise.name ?? "").length).toBeGreaterThan(0)
      }
    }
  }
}

describe("buildFallbackRoutine", () => {
  it("produces a schema-valid routine with daysPerWeek days of real catalog exercises", () => {
    const routine = buildFallbackRoutine(input(), catalog)

    expectSchemaValid(routine)
    expect(routine.days).toHaveLength(3)
    for (const day of routine.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(1)
    }
    expectRealCatalogReferences(routine, catalog)
    expect(routine.name.length).toBeGreaterThan(0)
  })

  it("emits sourceId and name taken from the catalog index", () => {
    const routine = buildFallbackRoutine(input(), catalog)
    const pushups = routine.days.flatMap((day) => day.exercises).find(
      (exercise) => exercise.sourceId === "Pushups",
    )
    expect(pushups?.name).toBe("Pushups")
  })

  it("is deterministic for the same input and catalog", () => {
    expect(buildFallbackRoutine(input(), catalog)).toEqual(buildFallbackRoutine(input(), catalog))
  })

  it("supports the daysPerWeek lower boundary of 1", () => {
    const routine = buildFallbackRoutine(input({ daysPerWeek: 1 }), catalog)
    expectSchemaValid(routine)
    expect(routine.days).toHaveLength(1)
    expect(routine.days[0]?.exercises.length).toBeGreaterThanOrEqual(1)
    expectRealCatalogReferences(routine, catalog)
  })

  it("supports the daysPerWeek upper boundary of 7", () => {
    const routine = buildFallbackRoutine(input({ daysPerWeek: 7 }), catalog)
    expectSchemaValid(routine)
    expect(routine.days).toHaveLength(7)
    for (const day of routine.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(1)
    }
    expectRealCatalogReferences(routine, catalog)
  })

  it("returns valid custom-named exercises when the catalog is empty", () => {
    const empty = buildCatalogIndex([])
    const routine = buildFallbackRoutine(input({ daysPerWeek: 4 }), empty)

    expectSchemaValid(routine)
    expect(routine.days).toHaveLength(4)
    for (const day of routine.days) {
      expect(day.exercises.length).toBeGreaterThanOrEqual(1)
      for (const exercise of day.exercises) {
        expect(exercise.sourceId ?? null).toBeNull()
        expect(typeof exercise.name).toBe("string")
        expect((exercise.name ?? "").length).toBeGreaterThan(0)
      }
    }
    expect(buildFallbackRoutine(input({ daysPerWeek: 4 }), empty)).toEqual(routine)
  })

  it("stays valid when equipment matches no template and substitutes from the catalog", () => {
    const routine = buildFallbackRoutine(
      input({ equipment: ["foam roll"], goal: "get_stronger", experience: "advanced", daysPerWeek: 5 }),
      catalog,
    )
    expectSchemaValid(routine)
    expect(routine.days).toHaveLength(5)
    expectRealCatalogReferences(routine, catalog)
  })
})
