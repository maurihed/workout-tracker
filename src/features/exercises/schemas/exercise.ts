import { z } from "zod"

const EQUIPMENT = [
  "body only",
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "kettlebells",
  "bands",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "e-z curl bar",
  "other",
] as const

export const exerciseListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
  muscle: z.string().trim().min(1).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  limit: z.coerce
    .number()
    .int()
    .transform((value) => Math.min(50, Math.max(1, value)))
    .default(20),
  cursor: z.string().optional(),
})

export type ExerciseListInput = z.infer<typeof exerciseListQuerySchema>

export const exerciseSummarySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  nameEs: z.string().nullable(),
  equipment: z.string().nullable(),
  level: z.string().nullable(),
  category: z.string().nullable(),
  primaryMuscles: z.array(z.string()),
  images: z.array(z.string()),
})

export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>
