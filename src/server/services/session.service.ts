import "server-only"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import { levelForXp } from "@/features/gamification/lib/level"
import type { SessionUpsertInput } from "@/features/workouts/schemas/session"
import type {
  Prisma,
  SessionStatus,
  SetType,
  TimerType,
} from "@/generated/prisma/client"
import * as repos from "@/server/repositories/session.repository"
import * as statsRepos from "@/server/repositories/stats.repository"
import * as statsService from "@/server/services/stats.service"
import type { AchievementDTO } from "@/server/services/stats.service"
import { withTransaction } from "@/server/repositories/routine.repository"

export type SessionSetDTO = {
  id: string
  setNumber: number
  type: SetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
  isPr: boolean
}

export type SessionExerciseDTO = {
  id: string
  exerciseId: string | null
  order: number
  nameSnapshot: string
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  timerType: TimerType | null
  workSeconds: number | null
  rounds: number | null
  completed: boolean
  skipped: boolean
  swappedFromId: string | null
  notes: string | null
  exercise: { id: string; name: string; nameEs: string | null; images: string[] } | null
  sets: SessionSetDTO[]
  lastPerformance: repos.LastPerformance | null
}

export type SessionDTO = {
  id: string
  userId: string
  routineId: string | null
  routineDayId: string | null
  name: string
  status: SessionStatus
  startedAt: string
  completedAt: string | null
  activeSeconds: number
  notes: string | null
  snapshot: Prisma.JsonValue
  exercises: SessionExerciseDTO[]
}

/**
 * Lean write acknowledgement. Write responses deliberately omit `exercises` and
 * `lastPerformance` so a debounced `PUT` (which fires constantly) does not pay
 * the 2×N previous-performance lookup cost; the client already holds the
 * authoritative state and discards the response.
 */
export type SessionStateAck = {
  id: string
  status: SessionStatus
  activeSeconds: number
  completedAt: string | null
}

export type SessionCelebration = {
  xpGained: number
  level: number
  leveledUp: boolean
  unlocked: AchievementDTO[]
}

export type SessionCompletionResult = SessionStateAck & { celebration: SessionCelebration }

function toStateAck(session: repos.SessionAckRecord): SessionStateAck {
  return {
    id: session.id,
    status: session.status,
    activeSeconds: session.activeSeconds,
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
  }
}

/**
 * Serializes the Prisma record to the wire DTO (datetimes as ISO strings) and,
 * for reads, attaches the previous-performance hint per catalog exercise. The
 * hint costs two queries per distinct exercise, so write responses opt out
 * (`withLastPerformance: false`); it is only needed on GET (active/detail).
 */
async function toSessionDTO(
  userId: string,
  session: repos.SessionRecord,
  { withLastPerformance = true }: { withLastPerformance?: boolean } = {},
): Promise<SessionDTO> {
  const byExerciseId = new Map<string, repos.LastPerformance | null>()
  if (withLastPerformance) {
    const exerciseIds = [
      ...new Set(
        session.exercises
          .map((exercise) => exercise.exerciseId)
          .filter((id): id is string => id !== null),
      ),
    ]
    const performances = await Promise.all(
      exerciseIds.map(async (exerciseId) => {
        const lastPerformance = await repos.findLastPerformance(userId, exerciseId)
        return [exerciseId, lastPerformance] as const
      }),
    )
    for (const [exerciseId, lastPerformance] of performances) {
      byExerciseId.set(exerciseId, lastPerformance)
    }
  }

  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt ? session.completedAt.toISOString() : null,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        completedAt: set.completedAt ? set.completedAt.toISOString() : null,
      })),
      lastPerformance:
        withLastPerformance && exercise.exerciseId
          ? (byExerciseId.get(exercise.exerciseId) ?? null)
          : null,
    })),
  }
}

export async function upsertSession(
  userId: string,
  input: SessionUpsertInput,
): Promise<SessionStateAck> {
  const existing = await repos.findByIdForUser(userId, input.id)
  if (existing) {
    if (existing.status !== "in_progress") throw new ConflictError("Session is not in progress")
    const updated = await withTransaction(async (tx) => {
      await repos.replaceSets(tx, input.id, input.exercises)
      return repos.updateHeader(tx, input.id, { activeSeconds: input.activeSeconds })
    })
    logger.info({ event: "session.synced", userId, sessionId: input.id }, "session synced")
    return toStateAck(updated)
  }

  const day = await repos.findOwnedDay(userId, input.routineDayId)
  if (!day) throw new NotFoundError("Routine day not found")
  if (input.snapshot.routineDayId !== input.routineDayId) {
    throw new ValidationError("Snapshot does not match the routine day")
  }
  if (input.exercises.length === 0) throw new ConflictError("This day has no exercises")
  const exerciseIds = input.exercises
    .map((exercise) => exercise.exerciseId)
    .filter((id): id is string => id !== null)
  const known = await repos.existingExerciseIds(exerciseIds)
  for (const exerciseId of exerciseIds) {
    if (!known.has(exerciseId)) throw new ValidationError(`Unknown exercise: ${exerciseId}`)
  }

  const created = await withTransaction(async (tx) => {
    const abandoned = await repos.abandonOtherInProgress(tx, userId, input.id)
    if (abandoned.count > 0) {
      logger.info(
        { event: "session.conflict-resolved", userId, sessionId: input.id, abandoned: abandoned.count },
        "conflict resolved",
      )
    }
    return repos.createSessionFromUpsert(tx, userId, input)
  })
  logger.info({ event: "session.started", userId, sessionId: created.id }, "session started")
  return toStateAck(created)
}

export async function getActiveSession(userId: string): Promise<SessionDTO | null> {
  const session = await repos.findActiveByUser(userId)
  return session ? toSessionDTO(userId, session) : null
}

export async function getSession(userId: string, id: string): Promise<SessionDTO> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  return toSessionDTO(userId, session)
}

export async function completeSession(
  userId: string,
  id: string,
  activeSeconds: number,
): Promise<SessionCompletionResult> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status === "completed") {
    const stats = await statsRepos.findStatsByUser(userId)
    return {
      ...toStateAck(session),
      celebration: { xpGained: 0, level: stats?.level ?? 1, leveledUp: false, unlocked: [] },
    }
  }
  if (session.status === "abandoned") throw new ConflictError("Session is not in progress")

  const done = await repos.setStatus(id, "completed", { completedAt: new Date(), activeSeconds })
  let celebration: SessionCelebration = { xpGained: 0, level: 1, leveledUp: false, unlocked: [] }
  try {
    await statsService.markPersonalRecords(userId, id)
    const result = await statsService.recomputeUserStats(userId)
    const unlocked = await statsService.getUnlockedAchievements(userId, result.unlockedSlugs)
    celebration = {
      xpGained: result.stats.xp - result.xpBefore,
      level: result.stats.level,
      leveledUp: levelForXp(result.xpBefore) !== result.stats.level,
      unlocked,
    }
  } catch (error) {
    logger.error(
      { event: "stats.completion_failed", userId, sessionId: id, error },
      "stats recompute failed",
    )
  }
  logger.info({ event: "session.completed", userId, sessionId: id }, "session completed")
  return { ...toStateAck(done), celebration }
}

export async function abandonSession(userId: string, id: string): Promise<void> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status === "abandoned") return
  if (session.status === "completed") throw new ConflictError("Session is not in progress")
  await repos.setStatus(id, "abandoned", {})
  logger.info({ event: "session.abandoned", userId, sessionId: id }, "session abandoned")
}
