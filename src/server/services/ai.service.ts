import "server-only"
import { z } from "zod"
import { NotFoundError, RateLimitError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  GOALS,
  TIMER_TYPES,
  aiJobInputSchema,
  contractJsonSchema,
  formatValidationError,
  generatedRoutineSchema,
  normalizeGeneratedRoutine,
  type AiJobInput,
  type GeneratedRoutine,
} from "@/features/ai/lib/contract"
import { PROMPT_VERSION, buildPrompt, type PromptCatalogEntry } from "@/features/ai/lib/prompt"
import { AiUnavailableError, getProvider, type AiProvider } from "@/features/ai/lib/provider"
import {
  buildCatalogIndex,
  resolveExercises,
  type ResolvedDay,
} from "@/features/ai/lib/resolve-exercises"
import { buildFallbackRoutine } from "@/features/ai/lib/template-fallback"
import { Prisma, type Goal } from "@/generated/prisma/client"
import * as repo from "@/server/repositories/ai.repository"
import { enqueueAiJob } from "@/server/ai/queue"

export const AI_JOB_DAILY_LIMIT = 20
export const AI_JOB_RATE_LIMIT = 5

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_GENERATION_ATTEMPTS = 4

type GeneratedDay = GeneratedRoutine["days"][number]
type GeneratedExercise = GeneratedDay["exercises"][number]

export type AiRoutineExercise = GeneratedExercise & {
  exerciseId: string | null
  customName: string | null
}

export type AiRoutineDay = {
  weekday: number
  label: string | null
  exercises: AiRoutineExercise[]
}

export type AiRoutine = {
  name: string
  goal: Goal | null
  days: AiRoutineDay[]
}

export type AiJobResult = {
  source: "ai" | "template"
  customNames: string[]
  routine: AiRoutine
}

const storedExerciseSchema = z.object({
  sourceId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  sets: z.number().int(),
  reps: z.string(),
  restSeconds: z.number().int(),
  targetWeightKg: z.number().nullable().optional(),
  timerType: z.enum(TIMER_TYPES),
  workSeconds: z.number().int().nullable().optional(),
  rounds: z.number().int().nullable().optional(),
  exerciseId: z.string().nullable(),
  customName: z.string().nullable(),
})

const storedDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  label: z.string().nullable(),
  exercises: z.array(storedExerciseSchema),
})

const storedRoutineSchema = z.object({
  name: z.string(),
  goal: z.enum(GOALS).nullable(),
  days: z.array(storedDaySchema).min(1),
})

export const aiJobResultSchema = z.object({
  source: z.enum(["ai", "template"]),
  customNames: z.array(z.string()),
  routine: storedRoutineSchema,
})

function toPromptCatalog(
  entries: readonly { sourceId: string; name: string }[],
): PromptCatalogEntry[] {
  return entries.map((entry) => ({
    sourceId: entry.sourceId,
    name: entry.name,
    primaryMuscles: [],
  }))
}

function mergeResolved(generated: GeneratedRoutine, resolvedDays: ResolvedDay[]): AiRoutineDay[] {
  return generated.days.map((day, dayIndex) => {
    const resolvedDay = resolvedDays[dayIndex]
    return {
      weekday: day.weekday,
      label: day.label ?? null,
      exercises: day.exercises.map((exercise, exerciseIndex) => {
        const match = resolvedDay?.exercises[exerciseIndex]
        return {
          ...exercise,
          exerciseId: match?.exerciseId ?? null,
          customName: match?.customName ?? null,
        }
      }),
    }
  })
}

function buildJobResult(
  source: AiJobResult["source"],
  generated: GeneratedRoutine,
  resolved: { days: ResolvedDay[]; customNames: string[] },
): AiJobResult {
  return {
    source,
    customNames: resolved.customNames,
    routine: {
      name: generated.name,
      goal: generated.goal ?? null,
      days: mergeResolved(generated, resolved.days),
    },
  }
}

async function generateRoutine(
  provider: AiProvider,
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
): Promise<GeneratedRoutine> {
  let prompt = buildPrompt(input, catalog)
  let lastError = ""

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let raw: unknown
    try {
      raw = await provider.generateJson(prompt, contractJsonSchema)
    } catch (error) {
      if (error instanceof AiUnavailableError) throw error
      lastError = error instanceof Error ? error.message : "AI provider request failed"
      prompt = `${prompt}\n\nYour previous response failed: ${lastError}\nReturn a single valid JSON object that matches the schema.`
      continue
    }

    const parsed = generatedRoutineSchema.safeParse(raw)
    if (parsed.success) return normalizeGeneratedRoutine(parsed.data)

    lastError = formatValidationError(parsed.error)
    prompt = `${prompt}\n\nYour previous response did not match the schema. Fix these problems and return a corrected JSON object only:\n${lastError}`
  }

  throw new Error(
    `AI response failed validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastError}`,
  )
}

export async function createJob(userId: string, input: unknown) {
  const parsed = aiJobInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError("Invalid AI job input", parsed.error.issues)
  }

  const rate = await consumeRateLimit({
    key: `ai:job:${userId}`,
    limit: AI_JOB_RATE_LIMIT,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    throw new RateLimitError("Too many AI requests, try again shortly")
  }

  const recent = await repo.countRecentJobs(userId, new Date(Date.now() - DAY_MS))
  if (recent >= AI_JOB_DAILY_LIMIT) {
    throw new RateLimitError("Daily AI generation limit reached")
  }

  const job = await repo.createJob(userId, parsed.data as unknown as Prisma.InputJsonValue)
  try {
    await enqueueAiJob(job.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue AI job"
    try {
      await repo.markFailed(job.id, message)
    } catch {
      logger.info(
        { event: "ai.job.enqueue_compensation_failed", jobId: job.id },
        "Failed to compensate for a failed AI job enqueue",
      )
    }
    throw error
  }
  logger.info({ event: "ai.job.created", userId, jobId: job.id }, "AI job created")
  return job
}

export async function getJob(userId: string, id: string) {
  const job = await repo.findJob(userId, id)
  if (!job) throw new NotFoundError("AI job not found")
  return job
}

export function listJobs(userId: string) {
  return repo.listJobs(userId)
}

export async function cancelJob(userId: string, id: string) {
  const job = await repo.findJob(userId, id)
  if (!job) throw new NotFoundError("AI job not found")
  await repo.markCancelled(id)
  logger.info({ event: "ai.job.cancelled", userId, jobId: id }, "AI job cancelled")
  return getJob(userId, id)
}

export async function runJob(jobId: string, provider?: AiProvider): Promise<void> {
  const job = await repo.findJobById(jobId)
  if (!job || job.status !== "queued") return

  const claimed = await repo.markRunning(jobId)
  if (claimed.count === 0) return

  try {
    const input = aiJobInputSchema.parse(job.input)
    const catalogEntries = await repo.listCatalogEntries()
    const catalog = buildCatalogIndex(catalogEntries)
    const promptCatalog = toPromptCatalog(catalogEntries)

    let result: AiJobResult
    let model: string | null = null

    try {
      const activeProvider = provider ?? getProvider()
      model = process.env.AI_MODEL?.trim() || null
      const generated = await generateRoutine(activeProvider, input, promptCatalog)
      const resolved = resolveExercises(generated, catalog)
      result = buildJobResult("ai", generated, resolved)
    } catch {
      const fallback = buildFallbackRoutine(input, catalog)
      const resolved = resolveExercises(fallback, catalog)
      result = buildJobResult("template", fallback, resolved)
      model = null
    }

    const current = await repo.findJobById(jobId)
    if (current?.status === "cancelled") {
      logger.info(
        { event: "ai.job.cancelled_before_save", jobId },
        "AI job cancelled before saving result",
      )
      return
    }

    await repo.markSucceeded(
      jobId,
      result as unknown as Prisma.InputJsonValue,
      model,
      PROMPT_VERSION,
    )
    logger.info({ event: "ai.job.succeeded", jobId, source: result.source }, "AI job succeeded")
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI job failed"
    await repo.markFailed(jobId, message)
    logger.info({ event: "ai.job.failed", jobId, error: message }, "AI job failed")
  }
}

export async function acceptJob(userId: string, jobId: string): Promise<{ routineId: string }> {
  const job = await repo.findJob(userId, jobId)
  if (!job) throw new NotFoundError("AI job not found")

  const existing = await repo.findRoutineByJobId(userId, jobId)
  if (existing) return { routineId: existing.id }

  if (job.status !== "succeeded" || job.result == null) {
    throw new ValidationError("AI job has no result to accept")
  }

  const parsed = aiJobResultSchema.safeParse(job.result)
  if (!parsed.success) {
    throw new ValidationError("AI job result is not valid", parsed.error.issues)
  }

  const days: Prisma.RoutineDayUncheckedCreateWithoutRoutineInput[] = parsed.data.routine.days.map(
    (day, dayIndex) => ({
      weekday: day.weekday,
      label: day.label,
      order: dayIndex,
      exercises: {
        create: day.exercises.map((exercise, exerciseIndex) => ({
          exerciseId: exercise.exerciseId,
          customName: exercise.customName,
          order: exerciseIndex,
          targetSets: exercise.sets,
          targetReps: exercise.reps,
          restSeconds: exercise.restSeconds,
          targetWeightKg: exercise.targetWeightKg ?? null,
          setTargets: Prisma.DbNull,
          timerType: exercise.timerType,
          workSeconds: exercise.workSeconds ?? null,
          rounds: exercise.rounds ?? (exercise.timerType === "none" ? null : 1),
          notes: null,
        })),
      },
    }),
  )

  let routineId: string
  try {
    const routine = await repo.createRoutineFromJob(userId, {
      aiJobId: jobId,
      name: parsed.data.routine.name,
      goal: parsed.data.routine.goal,
      days,
    })
    routineId = routine.id
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await repo.findRoutineByJobId(userId, jobId)
      if (concurrent) return { routineId: concurrent.id }
    }
    throw error
  }

  logger.info({ event: "ai.job.accepted", userId, jobId, routineId }, "AI job accepted")
  return { routineId }
}
