import { z } from "zod"

const cursorSchema = z
  .string()
  .refine(
    (value) =>
      value.includes("|") &&
      !Number.isNaN(Date.parse(value.slice(0, value.indexOf("|")))),
    "Invalid cursor",
  )

export const historyQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  routineId: z.string().min(1).optional(),
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>
