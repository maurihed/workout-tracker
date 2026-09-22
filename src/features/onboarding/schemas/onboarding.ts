import { z } from "zod"

export const fromTemplateSchema = z.object({ slug: z.string().trim().min(1) })
export type FromTemplateInput = z.infer<typeof fromTemplateSchema>
