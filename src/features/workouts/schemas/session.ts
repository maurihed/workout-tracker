import { z } from "zod"

export const setTypeSchema = z.enum(["warmup", "working", "drop", "failure"])
export const timerTypeSchema = z.enum(["none", "interval", "emom", "amrap"])

export const setInputSchema = z.object({
  id: z.string().uuid().optional(),
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
  id: z.string().uuid(),
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
  exercises: z.array(sessionExerciseInputSchema).max(100),
})
export type SessionStateInput = z.infer<typeof sessionStateSchema>

const snapshotExerciseSchema = z.object({
  order: z.number().int().min(0),
  name: z.string().trim().min(1).max(200),
  nameEs: z.string().trim().max(200).nullable().default(null),
  targetSets: z.number().int().min(0).max(50).nullable().default(null),
  targetReps: z.string().trim().max(50).nullable().default(null),
  restSeconds: z.number().int().min(0).max(3600).nullable().default(null),
  targetWeightKg: z.number().min(0).max(1000).nullable().default(null),
  timerType: timerTypeSchema.nullable().default(null),
  workSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
  rounds: z.number().int().min(0).max(1000).nullable().default(null),
})

export const sessionSnapshotSchema = z.object({
  routineId: z.string().min(1).nullable(),
  routineDayId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  nameEs: z.string().trim().max(200).nullable().default(null),
  weekday: z.number().int().min(0).max(6),
  label: z.string().trim().max(200).nullable().default(null),
  exercises: z.array(snapshotExerciseSchema).min(1).max(100),
})

export const sessionUpsertSchema = z.object({
  id: z.string().uuid(),
  routineDayId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  startedAt: z.string().datetime(),
  activeSeconds: z.number().int().min(0),
  snapshot: sessionSnapshotSchema,
  exercises: z.array(sessionExerciseInputSchema).max(100),
})
export type SessionUpsertInput = z.infer<typeof sessionUpsertSchema>

export const completeSessionSchema = z.object({ activeSeconds: z.number().int().min(0) })
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>
