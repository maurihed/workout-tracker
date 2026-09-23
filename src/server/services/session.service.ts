import "server-only"
import { ConflictError, NotFoundError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import type { SessionStateInput } from "@/features/workouts/schemas/session"
import type {
  Prisma,
  SessionStatus,
  SetType,
  TimerType,
} from "@/generated/prisma/client"
import * as repos from "@/server/repositories/session.repository"
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

export async function startSession(userId: string, routineDayId: string): Promise<SessionDTO> {
  const existing = await repos.findActiveByUser(userId)
  if (existing) throw new ConflictError("A workout is already in progress")

  const day = await repos.findOwnedDayWithExercises(userId, routineDayId)
  if (!day) throw new NotFoundError("Routine day not found")
  if (day.exercises.length === 0) throw new ConflictError("This day has no exercises")

  const session = await withTransaction((tx) =>
    repos.createSessionWithExercises(tx, { userId, day }),
  )
  logger.info({ event: "session.started", userId, sessionId: session.id }, "session started")
  // Start is a write: skip the last-performance lookup (the active GET supplies it).
  return toSessionDTO(userId, session, { withLastPerformance: false })
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

export async function replaceSessionState(
  userId: string,
  id: string,
  input: SessionStateInput,
): Promise<SessionStateAck> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")

  const updated = await withTransaction(async (tx) => {
    await repos.replaceSets(tx, id, input.exercises)
    return repos.updateHeader(tx, id, { activeSeconds: input.activeSeconds })
  })
  logger.info({ event: "session.updated", userId, sessionId: id }, "session updated")
  return toStateAck(updated)
}

export async function completeSession(
  userId: string,
  id: string,
  activeSeconds: number,
): Promise<SessionStateAck> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")

  const done = await repos.setStatus(id, "completed", { completedAt: new Date(), activeSeconds })
  logger.info({ event: "session.completed", userId, sessionId: id }, "session completed")
  return toStateAck(done)
}

export async function abandonSession(userId: string, id: string): Promise<void> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")

  await repos.setStatus(id, "abandoned", {})
  logger.info({ event: "session.abandoned", userId, sessionId: id }, "session abandoned")
}
