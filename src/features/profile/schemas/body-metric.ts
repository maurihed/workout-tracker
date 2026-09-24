import { z } from "zod"

export const bodyMetricUpsertSchema = z
  .object({
    recordedOn: z.string().date(),
    weightKg: z.number().min(0).max(500).nullable().optional(),
    bodyFatPct: z.number().min(0).max(100).nullable().optional(),
  })
  .refine((value) => value.weightKg != null || value.bodyFatPct != null, {
    message: "At least one measurement is required",
    path: ["weightKg"],
  })

export type BodyMetricUpsertInput = z.infer<typeof bodyMetricUpsertSchema>

export const bodyMetricQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
})

export type BodyMetricQuery = z.infer<typeof bodyMetricQuerySchema>

export type BodyMetricDTO = {
  id: string
  recordedOn: string
  weightKg: number | null
  bodyFatPct: number | null
}
