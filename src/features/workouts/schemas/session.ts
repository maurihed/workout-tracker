import { z } from "zod"

export const startSessionSchema = z.object({ routineDayId: z.string().min(1) })
export type StartSessionInput = z.infer<typeof startSessionSchema>

const setTypeSchema = z.enum(["warmup", "working", "drop", "failure"])

export const setInputSchema = z.object({
  id: z.string().optional(),
  setNumber: z.number().int().min(1),
  type: setTypeSchema,
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  weightKg: z.number().min(0).max(1000).nullable().default(null),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  restSecondsLogged: z.number().int().min(0).max(86_400).nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
})

export const sessionExerciseInputSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1).nullable(),
  nameSnapshot: z.string().trim().min(1).max(200),
  swappedFromId: z.string().min(1).nullable().default(null),
  completed: z.boolean(),
  skipped: z.boolean(),
  notes: z.string().trim().max(500).nullable().default(null),
  sets: z.array(setInputSchema).max(50),
})

export const sessionStateSchema = z.object({
  activeSeconds: z.number().int().min(0),
  exercises: z.array(sessionExerciseInputSchema),
})
export type SessionStateInput = z.infer<typeof sessionStateSchema>

export const completeSessionSchema = z.object({ activeSeconds: z.number().int().min(0) })
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>
