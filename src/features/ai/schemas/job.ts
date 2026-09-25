import { z } from "zod"
import type { AiJob } from "@/generated/prisma/client"
import { aiJobInputSchema, type AiJobInput } from "@/features/ai/lib/contract"
import {
  aiJobResultSchema,
  type AiJobResult,
} from "@/server/services/ai.service"

export const AI_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number]

export type AiJobDTO = {
  id: string
  status: AiJobStatus
  input: AiJobInput | null
  result: AiJobResult | null
  model: string | null
  promptVersion: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export const aiJobDtoSchema = z.object({
  id: z.string(),
  status: z.enum(AI_JOB_STATUSES),
  input: aiJobInputSchema.nullable(),
  result: aiJobResultSchema.nullable(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
})

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

export function toAiJobDTO(job: AiJob): AiJobDTO {
  const input = aiJobInputSchema.safeParse(job.input)
  const result = aiJobResultSchema.safeParse(job.result)

  return {
    id: job.id,
    status: job.status as AiJobStatus,
    input: input.success ? input.data : null,
    result: result.success ? result.data : null,
    model: job.model,
    promptVersion: job.promptVersion,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: toIso(job.startedAt),
    finishedAt: toIso(job.finishedAt),
  }
}
