import { describe, expect, it } from "vitest"
import {
  aiJobInputSchema,
  aiJobResultSchema,
  contractJsonSchema,
  formatValidationError,
  generatedRoutineSchema,
  normalizeGeneratedRoutine,
} from "@/features/ai/lib/contract"

const validExercise = {
  sourceId: "Barbell_Bench_Press",
  name: "  Barbell Bench Press  ",
  sets: 4,
  reps: "8-10",
  restSeconds: 90,
  targetWeightKg: 60,
  timerType: "none" as const,
}

const validDay = {
  weekday: 0,
  label: "  Push  ",
  exercises: [validExercise],
}

const validRoutine = {
  name: "  Push Pull Legs  ",
  goal: "build_muscle" as const,
  days: [validDay],
}

describe("generatedRoutineSchema", () => {
  it("accepts a valid payload", () => {
    const result = generatedRoutineSchema.safeParse(validRoutine)
    expect(result.success).toBe(true)
  })

  it("rejects a zero-exercise day", () => {
    const result = generatedRoutineSchema.safeParse({
      name: "Minimal",
      goal: null,
      days: [{ weekday: 1, exercises: [] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects duplicate weekdays", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [validDay, { ...validDay, label: "Push again" }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a timed exercise that has workSeconds", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [
        {
          ...validDay,
          exercises: [{ ...validExercise, timerType: "interval", workSeconds: 40, rounds: 5 }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects when days is missing", () => {
    const result = generatedRoutineSchema.safeParse({ name: validRoutine.name, goal: validRoutine.goal })
    expect(result.success).toBe(false)
  })

  it("rejects empty days", () => {
    expect(generatedRoutineSchema.safeParse({ ...validRoutine, days: [] }).success).toBe(false)
  })

  it("rejects sets: 0", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [{ ...validDay, exercises: [{ ...validExercise, sets: 0 }] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-string reps", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [{ ...validDay, exercises: [{ ...validExercise, reps: 10 }] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a timed exercise without workSeconds", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [{ ...validDay, exercises: [{ ...validExercise, timerType: "emom" }] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown top-level keys", () => {
    expect(generatedRoutineSchema.safeParse({ ...validRoutine, extra: true }).success).toBe(false)
  })

  it("rejects unknown nested keys", () => {
    const result = generatedRoutineSchema.safeParse({
      ...validRoutine,
      days: [{ ...validDay, exercises: [{ ...validExercise, extra: true }] }],
    })
    expect(result.success).toBe(false)
  })
})

describe("aiJobInputSchema", () => {
  it("accepts a valid input", () => {
    const result = aiJobInputSchema.safeParse({
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 3,
      focus: null,
    })
    expect(result.success).toBe(true)
  })

  it("rejects daysPerWeek out of range", () => {
    const result = aiJobInputSchema.safeParse({
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["barbell"],
      daysPerWeek: 0,
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown equipment", () => {
    const result = aiJobInputSchema.safeParse({
      goal: "build_muscle",
      experience: "beginner",
      equipment: ["spaceship"],
      daysPerWeek: 3,
    })
    expect(result.success).toBe(false)
  })
})

describe("aiJobInputSchema.personalize", () => {
  const base = { goal: "build_muscle", experience: "beginner", equipment: [], daysPerWeek: 3 }

  it("defaults personalize to true", () => {
    expect(aiJobInputSchema.parse(base).personalize).toBe(true)
  })

  it("accepts an explicit false", () => {
    expect(aiJobInputSchema.parse({ ...base, personalize: false }).personalize).toBe(false)
  })

  it("rejects a non-boolean", () => {
    expect(aiJobInputSchema.safeParse({ ...base, personalize: "yes" }).success).toBe(false)
  })
})

describe("aiJobResultSchema", () => {
  it("defaults legacy provenance fields when they are absent", () => {
    const result = aiJobResultSchema.parse({
      source: "ai",
      customNames: [],
      routine: {
        name: "Legacy Plan",
        goal: "build_muscle",
        days: [
          {
            weekday: 0,
            label: null,
            exercises: [
              {
                sourceId: "Barbell_Full_Squat",
                name: "Barbell Full Squat",
                sets: 3,
                reps: "8-12",
                restSeconds: 90,
                targetWeightKg: 60,
                timerType: "none",
                exerciseId: null,
                customName: null,
              },
            ],
          },
        ],
      },
    })

    expect(result.personalized).toBe(false)
    expect(result.personalizedCount).toBe(0)
    expect(result.personalizationVersion).toBe("0")
  })
})

describe("contractJsonSchema", () => {
  it("is a plain serializable object", () => {
    expect(JSON.parse(JSON.stringify(contractJsonSchema))).toEqual(contractJsonSchema)
  })
})

describe("formatValidationError", () => {
  it("summarizes each issue with its path", () => {
    const result = generatedRoutineSchema.safeParse({ name: "x" })
    expect(result.success).toBe(false)
    if (result.success) return
    const message = formatValidationError(result.error)
    expect(message).toContain("days")
    expect(message.length).toBeGreaterThan(0)
  })

  it("labels nested array paths with indices", () => {
    const result = generatedRoutineSchema.safeParse({
      name: "x",
      days: [{ weekday: 0, exercises: [{ sets: 0, reps: "5", restSeconds: 60, timerType: "none" }] }],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(formatValidationError(result.error)).toContain("days.0.exercises.0.sets")
  })
})

describe("normalizeGeneratedRoutine", () => {
  it("trims strings and keeps schema-valid days", () => {
    const parsed = generatedRoutineSchema.parse({
      name: "  Full Body  ",
      days: [
        {
          weekday: 0,
          label: "  Day A  ",
          exercises: [
            { name: "  Squat  ", sets: 3, reps: "5", restSeconds: 60, timerType: "none" },
          ],
        },
        {
          weekday: 1,
          label: "  Day B  ",
          exercises: [
            { name: "  Bench  ", sets: 3, reps: "5", restSeconds: 60, timerType: "none" },
          ],
        },
      ],
    })
    const normalized = normalizeGeneratedRoutine(parsed)
    expect(normalized.name).toBe("Full Body")
    expect(normalized.days).toHaveLength(2)
    expect(normalized.days[0]?.label).toBe("Day A")
    expect(normalized.days[0]?.exercises[0]?.name).toBe("Squat")
  })

  it("never returns zero days for schema-valid input", () => {
    const parsed = generatedRoutineSchema.parse(validRoutine)
    const normalized = normalizeGeneratedRoutine(parsed)
    expect(normalized.days.length).toBeGreaterThan(0)
  })

  it("de-dupes exercises by trimmed lowercased sourceId or name", () => {
    const parsed = generatedRoutineSchema.parse({
      name: "Full Body",
      days: [
        {
          weekday: 0,
          exercises: [
            { sourceId: "Squat", name: "Squat", sets: 3, reps: "5", restSeconds: 60, timerType: "none" },
            { sourceId: " squat ", name: "Back Squat", sets: 3, reps: "5", restSeconds: 60, timerType: "none" },
            { name: "Lunge", sets: 3, reps: "10", restSeconds: 60, timerType: "none" },
            { name: " lunge ", sets: 3, reps: "10", restSeconds: 60, timerType: "none" },
          ],
        },
      ],
    })
    const normalized = normalizeGeneratedRoutine(parsed)
    expect(normalized.days[0]?.exercises).toHaveLength(2)
  })
})
