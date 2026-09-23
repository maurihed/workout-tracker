import { z } from "zod"

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().default(null),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable()
    .default(null),
})
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>

const timerTypeSchema = z.enum(["none", "interval", "emom", "amrap"])

export const routineExerciseInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    targetSets: z.number().int().min(1).max(20),
    targetReps: z.string().trim().min(1).max(20),
    restSeconds: z.number().int().min(0).max(3600),
    targetWeightKg: z.number().positive().max(1000).nullable().default(null),
    timerType: timerTypeSchema.default("none"),
    workSeconds: z.number().int().min(1).max(3600).nullable().default(null),
    rounds: z.number().int().min(1).max(50).nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((v) => v.timerType === "none" || (v.workSeconds != null && v.rounds != null), {
    message: "workSeconds and rounds are required for timed exercises",
    path: ["timerType"],
  })

export const routineDayInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  label: z.string().trim().max(60).nullable().default(null),
  exercises: z.array(routineExerciseInputSchema).min(1).max(50),
})

export const routineInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().default(null),
    goal: z
      .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
      .nullable()
      .default(null),
    days: z.array(routineDayInputSchema).min(1).max(7),
  })
  .refine((v) => new Set(v.days.map((d) => d.weekday)).size === v.days.length, {
    message: "Each weekday may appear only once",
    path: ["days"],
  })
export type RoutineInput = z.infer<typeof routineInputSchema>
