import { z } from "zod"

export const analyticsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12),
})
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>
