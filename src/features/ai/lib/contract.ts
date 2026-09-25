import { z } from "zod"
import { EQUIPMENT } from "@/features/exercises/schemas/exercise"

export const GOALS = [
  "lose_weight",
  "build_muscle",
  "get_stronger",
  "endurance",
  "general_fitness",
] as const

export const EXPERIENCES = ["beginner", "intermediate", "advanced"] as const

export const TIMER_TYPES = ["none", "interval", "emom", "amrap"] as const

export const generatedExerciseSchema = z
  .object({
    sourceId: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    sets: z.number().int().min(1).max(10),
    reps: z.string(),
    restSeconds: z.number().int().min(0).max(3600),
    targetWeightKg: z.number().nullable().optional(),
    timerType: z.enum(TIMER_TYPES),
    workSeconds: z.number().int().min(1).max(3600).nullable().optional(),
    rounds: z.number().int().min(1).max(50).nullable().optional(),
  })
  .strict()
  .refine((value) => value.timerType === "none" || value.workSeconds != null, {
    message: "workSeconds is required for timed exercises",
    path: ["timerType"],
  })

export const generatedDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    label: z.string().nullable().optional(),
    exercises: z.array(generatedExerciseSchema).min(1),
  })
  .strict()

export const generatedRoutineSchema = z
  .object({
    name: z.string(),
    goal: z.enum(GOALS).nullable().optional(),
    days: z.array(generatedDaySchema).min(1),
  })
  .strict()
  .refine((value) => new Set(value.days.map((day) => day.weekday)).size === value.days.length, {
    message: "Each weekday may appear only once",
    path: ["days"],
  })

export type GeneratedRoutine = z.infer<typeof generatedRoutineSchema>

export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")
}

export const aiJobInputSchema = z.object({
  goal: z.enum(GOALS),
  experience: z.enum(EXPERIENCES),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  daysPerWeek: z.number().int().min(1).max(7),
  focus: z.string().trim().max(100).nullable().optional(),
})

export type AiJobInput = z.infer<typeof aiJobInputSchema>

type GeneratedDay = GeneratedRoutine["days"][number]
type GeneratedExercise = GeneratedDay["exercises"][number]

function exerciseIdentity(exercise: GeneratedExercise): string | null {
  const sourceId = exercise.sourceId?.trim().toLowerCase()
  if (sourceId) return sourceId
  const name = exercise.name?.trim().toLowerCase()
  if (name) return name
  return null
}

function dedupeExercises(exercises: GeneratedExercise[]): GeneratedExercise[] {
  const seen = new Set<string>()
  return exercises.filter((exercise) => {
    const identity = exerciseIdentity(exercise)
    if (identity == null) return true
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

export function normalizeGeneratedRoutine(value: GeneratedRoutine): GeneratedRoutine {
  const days = value.days
    .map((day) => ({
      ...day,
      label: day.label?.trim() ?? day.label,
      exercises: dedupeExercises(
        day.exercises.map((exercise) => ({
          ...exercise,
          name: exercise.name?.trim() ?? exercise.name,
        })),
      ),
    }))
    .filter((day) => day.exercises.length > 0)

  return { ...value, name: value.name.trim(), days }
}

export type AiRoutineExercise = GeneratedExercise & {
  exerciseId: string | null
  customName: string | null
}

export type AiRoutineDay = {
  weekday: number
  label: string | null
  exercises: AiRoutineExercise[]
}

export type AiRoutine = {
  name: string
  goal: (typeof GOALS)[number] | null
  days: AiRoutineDay[]
}

export type AiJobResult = {
  source: "ai" | "template"
  customNames: string[]
  routine: AiRoutine
}

export const storedExerciseSchema = z.object({
  sourceId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  sets: z.number().int(),
  reps: z.string(),
  restSeconds: z.number().int(),
  targetWeightKg: z.number().nullable().optional(),
  timerType: z.enum(TIMER_TYPES),
  workSeconds: z.number().int().nullable().optional(),
  rounds: z.number().int().nullable().optional(),
  exerciseId: z.string().nullable(),
  customName: z.string().nullable(),
})

export const storedDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  label: z.string().nullable(),
  exercises: z.array(storedExerciseSchema),
})

export const storedRoutineSchema = z.object({
  name: z.string(),
  goal: z.enum(GOALS).nullable(),
  days: z.array(storedDaySchema).min(1),
})

export const aiJobResultSchema = z.object({
  source: z.enum(["ai", "template"]),
  customNames: z.array(z.string()),
  routine: storedRoutineSchema,
})

export const contractJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "days"],
  properties: {
    name: { type: "string" },
    goal: {
      anyOf: [{ type: "string", enum: [...GOALS] }, { type: "null" }],
    },
    days: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["weekday", "exercises"],
        properties: {
          weekday: { type: "integer", minimum: 0, maximum: 6 },
          label: { anyOf: [{ type: "string" }, { type: "null" }] },
          exercises: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sets", "reps", "restSeconds", "timerType"],
              properties: {
                sourceId: { anyOf: [{ type: "string" }, { type: "null" }] },
                name: { anyOf: [{ type: "string" }, { type: "null" }] },
                sets: { type: "integer", minimum: 1, maximum: 10 },
                reps: { type: "string" },
                restSeconds: { type: "integer", minimum: 0, maximum: 3600 },
                targetWeightKg: { anyOf: [{ type: "number" }, { type: "null" }] },
                timerType: { type: "string", enum: [...TIMER_TYPES] },
                workSeconds: {
                  anyOf: [
                    { type: "integer", minimum: 1, maximum: 3600 },
                    { type: "null" },
                  ],
                },
                rounds: {
                  anyOf: [
                    { type: "integer", minimum: 1, maximum: 50 },
                    { type: "null" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
}
