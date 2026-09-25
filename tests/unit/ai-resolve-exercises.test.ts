import { describe, expect, it } from "vitest"
import {
  generatedRoutineSchema,
  type GeneratedRoutine,
} from "@/features/ai/lib/contract"
import {
  buildCatalogIndex,
  resolveExercises,
  type CatalogEntry,
} from "@/features/ai/lib/resolve-exercises"

const CATALOG: CatalogEntry[] = [
  { id: "ex-squat", sourceId: "Barbell_Squat", name: "Barbell Squat" },
  { id: "ex-bench", sourceId: "Barbell_Bench_Press", name: "Barbell Bench Press" },
  { id: "ex-row", sourceId: "Barbell_Row", name: "Barbell Row" },
  { id: "ex-row-machine", sourceId: "Row_Machine", name: "Row Machine" },
  { id: "ex-cable-curl", sourceId: "Cable_Curl", name: "Cable Curl" },
  { id: "ex-barbell-curl", sourceId: "Barbell_Curl", name: "Barbell Curl" },
  { id: "ex-dip", sourceId: "Bench_Dip", name: "Bench Dip" },
  { id: "ex-incline", sourceId: "Incline_Bench_Press", name: "Incline Bench Press" },
]

const catalog = buildCatalogIndex(CATALOG)

function routine(exercises: Record<string, unknown>[], label?: string | null): GeneratedRoutine {
  return generatedRoutineSchema.parse({
    name: "Test Routine",
    days: [
      {
        weekday: 1,
        ...(label === undefined ? {} : { label }),
        exercises,
      },
    ],
  })
}

function pass(sets = 3, reps = "8-10", restSeconds = 90) {
  return { sets, reps, restSeconds, timerType: "none" as const }
}

describe("resolveExercises", () => {
  it("resolves by sourceId", () => {
    const result = resolveExercises(routine([{ sourceId: "Barbell_Squat", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-squat")
    expect(result.days[0]?.exercises[0]?.customName).toBeNull()
    expect(result.customNames).toEqual([])
  })

  it("resolves sourceId case-insensitively and trims it", () => {
    const result = resolveExercises(
      routine([
        { sourceId: "barbell_squat", ...pass() },
        { sourceId: "  BARBELL_SQUAT  ", ...pass() },
      ]),
      catalog,
    )
    expect(result.days[0]?.exercises.map((exercise) => exercise.exerciseId)).toEqual([
      "ex-squat",
      "ex-squat",
    ])
  })

  it("resolves by exact name when sourceId is absent", () => {
    const result = resolveExercises(routine([{ name: "Barbell Bench Press", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-bench")
    expect(result.days[0]?.exercises[0]?.customName).toBeNull()
  })

  it("resolves by exact name case/space-insensitively", () => {
    const result = resolveExercises(
      routine([{ name: "  barbell   bench-press ", ...pass() }]),
      catalog,
    )
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-bench")
  })

  it("falls back to exact name when the sourceId does not match", () => {
    const result = resolveExercises(
      routine([{ sourceId: "totally_unknown", name: "Barbell Row", ...pass() }]),
      catalog,
    )
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-row")
  })

  it("fuzzy matches on a single shared meaningful token, deterministically by catalog order", () => {
    const result = resolveExercises(routine([{ name: "Row", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-row")
    expect(result.customNames).toEqual([])
  })

  it("fuzzy prefers the candidate with the most shared tokens over catalog order", () => {
    const result = resolveExercises(routine([{ name: "bench press", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBe("ex-bench")
  })

  it("fuzzy ignores stopwords and short tokens", () => {
    const result = resolveExercises(routine([{ name: "the a of", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBeNull()
    expect(result.days[0]?.exercises[0]?.customName).toBe("the a of")
  })

  it("marks unmatched exercises custom with a trimmed name", () => {
    const result = resolveExercises(routine([{ name: "  Zercher Lift  ", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBeNull()
    expect(result.days[0]?.exercises[0]?.customName).toBe("Zercher Lift")
    expect(result.customNames).toEqual(["Zercher Lift"])
  })

  it("derives a custom name from the sourceId when the name is absent", () => {
    const result = resolveExercises(routine([{ sourceId: "custom_mystery_move", ...pass() }]), catalog)
    expect(result.days[0]?.exercises[0]?.exerciseId).toBeNull()
    expect(result.days[0]?.exercises[0]?.customName).toBe("custom mystery move")
    expect(result.customNames).toEqual(["custom mystery move"])
  })

  it("de-duplicates custom names", () => {
    const result = resolveExercises(
      routine([
        { name: "Zercher Lift", ...pass() },
        { name: "Zercher Lift", ...pass() },
        { name: "zercher lift", ...pass() },
      ]),
      catalog,
    )
    expect(result.days[0]?.exercises.map((exercise) => exercise.customName)).toEqual([
      "Zercher Lift",
      "Zercher Lift",
      "zercher lift",
    ])
    expect(result.customNames).toEqual(["Zercher Lift"])
  })

  it("defaults targetWeightKg, workSeconds and rounds to null", () => {
    const result = resolveExercises(routine([{ sourceId: "Barbell_Squat", ...pass() }]), catalog)
    const exercise = result.days[0]?.exercises[0]
    expect(exercise?.targetWeightKg).toBeNull()
    expect(exercise?.workSeconds).toBeNull()
    expect(exercise?.rounds).toBeNull()
  })

  it("carries through the generated prescription and timer fields", () => {
    const result = resolveExercises(
      routine([
        {
          sourceId: "Barbell_Squat",
          sets: 5,
          reps: "5",
          restSeconds: 120,
          targetWeightKg: 100,
          timerType: "interval",
          workSeconds: 40,
          rounds: 6,
        },
      ]),
      catalog,
    )
    const exercise = result.days[0]?.exercises[0]
    expect(exercise).toMatchObject({
      exerciseId: "ex-squat",
      customName: null,
      sets: 5,
      reps: "5",
      restSeconds: 120,
      targetWeightKg: 100,
      timerType: "interval",
      workSeconds: 40,
      rounds: 6,
    })
  })

  it("preserves weekday and label, defaulting a missing label to null", () => {
    const generated = generatedRoutineSchema.parse({
      name: "Two Days",
      days: [
        { weekday: 0, label: "  Push  ", exercises: [{ name: "Barbell_Row", ...pass() }] },
        { weekday: 3, exercises: [{ sourceId: "Barbell_Squat", ...pass() }] },
      ],
    })
    const result = resolveExercises(generated, catalog)
    expect(result.days.map((day) => day.weekday)).toEqual([0, 3])
    expect(result.days[0]?.label).toBe("  Push  ")
    expect(result.days[1]?.label).toBeNull()
  })

  it("marks everything custom with an empty catalog without throwing", () => {
    const empty = buildCatalogIndex([])
    const result = resolveExercises(
      routine([
        { sourceId: "Barbell_Squat", name: "Barbell Squat", ...pass() },
        { name: "Zercher Lift", ...pass() },
      ]),
      empty,
    )
    expect(result.days[0]?.exercises.every((exercise) => exercise.exerciseId === null)).toBe(true)
    expect(result.customNames).toEqual(["Barbell Squat", "Zercher Lift"])
  })

  it("normalizes catalog map keys through buildCatalogIndex", () => {
    const index = buildCatalogIndex([{ id: "x", sourceId: " Barbell_Squat ", name: "Barbell Squat" }])
    expect(index.bySourceId.get("barbell squat")?.id).toBe("x")
    expect(index.byName.get("barbell squat")?.id).toBe("x")
  })
})
