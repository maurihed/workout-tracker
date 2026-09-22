import { z } from "zod"

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const profileSchema = z.object({
  id: z.string(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  heightCm: z.number().int().min(50).max(300).nullable(),
  weightKg: z.number().positive().max(500).nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable(),
  unitSystem: z.enum(["metric", "imperial"]),
  timezone: z.string().refine(isIanaTimezone, "Invalid IANA timezone"),
  weekStartsOn: z.number().int().min(0).max(6),
  daysPerWeek: z.number().int().min(1).max(7).nullable(),
  notificationsEnabled: z.boolean(),
  onboardedAt: z.string().datetime().nullable(),
})

export type ProfileDTO = z.infer<typeof profileSchema>

export const updateProfileSchema = z.object({
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  heightCm: z.number().int().min(50).max(300).nullable().optional(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable().optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable()
    .optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  timezone: z.string().refine(isIanaTimezone, "Invalid IANA timezone").optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  daysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  onboardedAt: z.string().datetime().nullable().optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
