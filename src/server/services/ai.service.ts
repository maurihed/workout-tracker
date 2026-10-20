import "server-only"
import { NotFoundError, RateLimitError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import { consumeRateLimit } from "@/lib/rate-limit"
import {
  aiJobInputSchema,
  aiJobResultSchema,
  contractJsonSchema,
  formatValidationError,
  generatedRoutineSchema,
  normalizeGeneratedRoutine,
  type AiJobInput,
  type AiJobResult,
  type AiRoutine,
  type AiRoutineDay,
  type GeneratedRoutine,
} from "@/features/ai/lib/contract"
import {
  HISTORY_MAX_SESSIONS,
  HISTORY_WINDOW_DAYS,
  buildHistoryIndex,
  buildHistorySummary,
  type HistoryIndex,
} from "@/features/ai/lib/history"
import { filterCatalogEntriesForInput } from "@/features/ai/lib/gym-profile"
import { PERSONALIZATION_VERSION, personalizeRoutine } from "@/features/ai/lib/personalize"
import { PROMPT_VERSION, buildPrompt, type PromptCatalogEntry } from "@/features/ai/lib/prompt"
import { AiUnavailableError, getProvider, type AiProvider } from "@/features/ai/lib/provider"
import {
  buildCatalogIndex,
  resolveExercises,
  type ResolvedDay,
} from "@/features/ai/lib/resolve-exercises"
import { buildFallbackRoutine } from "@/features/ai/lib/template-fallback"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "@/server/repositories/ai.repository"
import { enqueueAiJob } from "@/server/ai/queue"

export const AI_JOB_DAILY_LIMIT = 20
export const AI_JOB_RATE_LIMIT = 5
export const AI_JOB_STALE_MS = 10 * 60 * 1000
export const AI_JOB_MAX_ATTEMPTS = 5

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_GENERATION_ATTEMPTS = 4

export type {
  AiJobResult,
  AiRoutine,
  AiRoutineDay,
  AiRoutineExercise,
} from "@/features/ai/lib/contract"

function toPromptCatalog(
  entries: readonly {
    sourceId: string
    name: string
    primaryMuscles: string[]
    equipment: string | null
  }[],
): PromptCatalogEntry[] {
  return entries.map((entry) => ({
    sourceId: entry.sourceId,
    name: entry.name,
    primaryMuscles: entry.primaryMuscles,
    equipment: entry.equipment,
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
  historyIndex: HistoryIndex | null,
): AiJobResult {
  const routine: AiRoutine = {
    name: generated.name,
    goal: generated.goal ?? null,
    days: mergeResolved(generated, resolved.days),
  }
  let personalized = false
  let personalizedCount = 0
  if (historyIndex) {
    try {
      const applied = personalizeRoutine(routine, historyIndex)
      routine.days = applied.routine.days
      personalizedCount = applied.applied
      personalized = applied.applied > 0
    } catch (error) {
      logger.warn(
        {
          event: "ai.personalization_failed",
          error: error instanceof Error ? error.message : "unknown error",
        },
        "personalization failed; storing the un-personalized result",
      )
    }
  }
  return {
    source,
    customNames: resolved.customNames,
    routine,
    personalized,
    personalizedCount,
    personalizationVersion: PERSONALIZATION_VERSION,
  }
}

async function generateRoutine(
  provider: AiProvider,
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
  historySummary?: string,
): Promise<GeneratedRoutine> {
  let prompt = buildPrompt(input, catalog, historySummary)
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
    if (parsed.success) {
      const normalized = normalizeGeneratedRoutine(parsed.data)
      if (normalized.days.length === 0) {
        lastError = "routine must include at least one day with at least one exercise"
        prompt = `${prompt}\n\nYour previous response contained no usable exercises. ${lastError}`
        continue
      }
      return normalized
    }

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
  if (!job) return

  if (job.status === "queued") {
    const claimed = await repo.markRunning(jobId)
    if (claimed.count === 0) return
  } else if (job.status === "running") {
    const startedAt = job.startedAt?.getTime() ?? 0
    if (Date.now() - startedAt <= AI_JOB_STALE_MS) return
    if (job.attempts >= AI_JOB_MAX_ATTEMPTS) {
      await repo.markFailed(jobId, "AI job exceeded the maximum number of attempts")
      logger.info(
        { event: "ai.job.abandoned", jobId, attempts: job.attempts },
        "AI job abandoned after too many stale attempts",
      )
      return
    }
    const reclaimed = await repo.reclaimStaleRunning(
      jobId,
      new Date(Date.now() - AI_JOB_STALE_MS),
    )
    if (reclaimed.count === 0) return
  } else {
    return
  }

  try {
    const input = aiJobInputSchema.parse(job.input)
    const catalogEntries = await repo.listCatalogEntries()
    const catalog = buildCatalogIndex(catalogEntries)
    const eligibleEntries = filterCatalogEntriesForInput(catalogEntries, input)
    const promptCatalog = toPromptCatalog(eligibleEntries)
    const fallbackCatalog = buildCatalogIndex(eligibleEntries)

    let historyIndex: HistoryIndex | null = null
    let historySummary: string | undefined
    if (input.personalize) {
      try {
        const sessions = await repo.listRecentExerciseHistory(job.userId, {
          since: new Date(Date.now() - HISTORY_WINDOW_DAYS * DAY_MS),
          maxSessions: HISTORY_MAX_SESSIONS,
        })
        const index = buildHistoryIndex(sessions)
        if (index.hasData) {
          historyIndex = index
          historySummary = buildHistorySummary(index)
        }
      } catch (error) {
        logger.warn(
          {
            event: "ai.history_failed",
            jobId,
            error: error instanceof Error ? error.message : "unknown error",
          },
          "history load failed; generating without personalization",
        )
        historyIndex = null
        historySummary = undefined
      }
    }

    let result: AiJobResult
    let model: string | null = null

    try {
      const activeProvider = provider ?? getProvider()
      model = process.env.AI_MODEL?.trim() || null
      const generated = await generateRoutine(activeProvider, input, promptCatalog, historySummary)
      const resolved = resolveExercises(generated, catalog)
      result = buildJobResult("ai", generated, resolved, historyIndex)
    } catch (error) {
      logger.warn(
        {
          event: "ai.generation_fallback",
          jobId,
          error: error instanceof Error ? error.message : "unknown error",
        },
        "AI generation failed; using the template fallback",
      )
      const fallback = buildFallbackRoutine(input, fallbackCatalog)
      const resolved = resolveExercises(fallback, catalog)
      result = buildJobResult("template", fallback, resolved, historyIndex)
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

function isAiJobUniqueTarget(target: unknown): boolean {
  if (typeof target === "string") return target.includes("aiJobId")
  if (Array.isArray(target)) {
    return target.some((item) => typeof item === "string" && item.includes("aiJobId"))
  }
  return false
}

function isAiJobConflict(meta: unknown): boolean {
  if (meta == null || typeof meta !== "object") return false
  const record = meta as {
    target?: unknown
    driverAdapterError?: { cause?: { constraint?: { index?: unknown } } }
  }
  if (isAiJobUniqueTarget(record.target)) return true
  const index = record.driverAdapterError?.cause?.constraint?.index
  return typeof index === "string" && index.includes("aiJobId")
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

  const customExercises: repo.CustomExerciseWrite[] = []
  const seenCustom = new Set<string>()
  for (const day of parsed.data.routine.days) {
    for (const exercise of day.exercises) {
      if (exercise.exerciseId != null) continue
      const name = exercise.customName?.trim() ?? exercise.name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seenCustom.has(key)) continue
      seenCustom.add(key)
      customExercises.push({ name, instructions: exercise.instructions ?? [] })
    }
  }

  let routineId: string
  try {
    const routine = await repo.createRoutineFromJob(userId, {
      aiJobId: jobId,
      name: parsed.data.routine.name,
      goal: parsed.data.routine.goal,
      source: parsed.data.source === "template" ? "template" : "ai",
      days,
      customExercises,
    })
    routineId = routine.id
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      isAiJobConflict(error.meta)
    ) {
      const concurrent = await repo.findRoutineByJobId(userId, jobId)
      if (concurrent) return { routineId: concurrent.id }
    }
    throw error
  }

  logger.info({ event: "ai.job.accepted", userId, jobId, routineId }, "AI job accepted")
  return { routineId }
}
