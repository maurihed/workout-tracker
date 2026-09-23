import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma, SessionStatus, SetType } from "@/generated/prisma/client"
import type { SessionUpsertInput } from "@/features/workouts/schemas/session"

export const sessionSelect = {
  id: true,
  userId: true,
  routineId: true,
  routineDayId: true,
  name: true,
  status: true,
  startedAt: true,
  completedAt: true,
  activeSeconds: true,
  notes: true,
  snapshot: true,
  exercises: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      exerciseId: true,
      order: true,
      nameSnapshot: true,
      targetSets: true,
      targetReps: true,
      restSeconds: true,
      timerType: true,
      workSeconds: true,
      rounds: true,
      completed: true,
      skipped: true,
      swappedFromId: true,
      notes: true,
      exercise: { select: { id: true, name: true, nameEs: true, images: true } },
      sets: {
        orderBy: { setNumber: "asc" },
        select: {
          id: true,
          setNumber: true,
          type: true,
          reps: true,
          weightKg: true,
          durationSeconds: true,
          rpe: true,
          restSecondsLogged: true,
          completedAt: true,
        },
      },
    },
  },
} satisfies Prisma.WorkoutSessionSelect

export type SessionRecord = Prisma.WorkoutSessionGetPayload<{ select: typeof sessionSelect }>

/** Minimal header projection for write acknowledgements (no nested reads). */
export const sessionAckSelect = {
  id: true,
  status: true,
  activeSeconds: true,
  completedAt: true,
} satisfies Prisma.WorkoutSessionSelect

export type SessionAckRecord = Prisma.WorkoutSessionGetPayload<{
  select: typeof sessionAckSelect
}>

/** The user's current in-progress session, if any. */
export function findActiveByUser(userId: string) {
  return prisma.workoutSession.findFirst({
    where: { userId, status: "in_progress" },
    orderBy: { startedAt: "desc" },
    select: sessionSelect,
  })
}

/** Ownership-scoped session detail lookup. */
export function findByIdForUser(userId: string, id: string) {
  return prisma.workoutSession.findFirst({ where: { id, userId }, select: sessionSelect })
}

/** True when the routine day exists and its parent routine belongs to `userId`. */
export function findOwnedDay(userId: string, routineDayId: string) {
  return prisma.routineDay.findFirst({
    where: { id: routineDayId, routine: { userId } },
    select: { id: true },
  })
}

/** The subset of `ids` that exist in the catalog (for upsert validation). */
export async function existingExerciseIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true } })
  return new Set(rows.map((row) => row.id))
}

/** Marks every other in-progress session for the user abandoned (local wins). */
export function abandonOtherInProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  keepId: string,
) {
  return tx.workoutSession.updateMany({
    where: { userId, status: "in_progress", id: { not: keepId } },
    data: { status: "abandoned" },
  })
}

/** Creates the session (with its client snapshot, exercises, and sets) in one write. */
export function createSessionFromUpsert(
  tx: Prisma.TransactionClient,
  userId: string,
  input: SessionUpsertInput,
) {
  return tx.workoutSession.create({
    data: {
      id: input.id,
      userId,
      routineId: input.snapshot.routineId,
      routineDayId: input.routineDayId,
      name: input.name,
      status: "in_progress",
      startedAt: new Date(input.startedAt),
      activeSeconds: input.activeSeconds,
      snapshot: input.snapshot as Prisma.InputJsonValue,
      exercises: {
        create: input.exercises.map((exercise, index) => ({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          order: index,
          nameSnapshot: exercise.nameSnapshot,
          completed: exercise.completed,
          skipped: exercise.skipped,
          swappedFromId: exercise.swappedFromId,
          notes: exercise.notes,
          sets: {
            create: exercise.sets.map((set) => ({
              ...(set.id ? { id: set.id } : {}),
              setNumber: set.setNumber,
              type: set.type,
              reps: set.reps,
              weightKg: set.weightKg,
              durationSeconds: set.durationSeconds,
              rpe: set.rpe,
              restSecondsLogged: set.restSecondsLogged,
              completedAt: set.completedAt ? new Date(set.completedAt) : null,
            })),
          },
        })),
      },
    },
    select: sessionSelect,
  })
}

export type SetLogWriteInput = {
  id?: string | undefined
  setNumber: number
  type: SetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
}

export type SessionExerciseWriteInput = {
  id: string
  exerciseId: string | null
  nameSnapshot: string
  swappedFromId: string | null
  completed: boolean
  skipped: boolean
  notes: string | null
  sets: SetLogWriteInput[]
}

function setData(set: SetLogWriteInput) {
  return {
    setNumber: set.setNumber,
    type: set.type,
    reps: set.reps,
    weightKg: set.weightKg,
    durationSeconds: set.durationSeconds,
    rpe: set.rpe,
    restSecondsLogged: set.restSecondsLogged,
    completedAt: set.completedAt ? new Date(set.completedAt) : null,
  }
}

/**
 * Applies the submitted exercises to the session, upserting sets by their
 * client id and deleting only sets the payload dropped, so replaying the same
 * state never churns row ids. Ids that do not belong to the session are ignored.
 */
export async function replaceSets(
  tx: Prisma.TransactionClient,
  sessionId: string,
  exercises: SessionExerciseWriteInput[],
) {
  const owned = await tx.sessionExercise.findMany({ where: { sessionId }, select: { id: true } })
  const ownedIds = new Set(owned.map((row) => row.id))

  for (const exercise of exercises) {
    if (!ownedIds.has(exercise.id)) continue
    await tx.sessionExercise.update({
      where: { id: exercise.id },
      data: {
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
        completed: exercise.completed,
        skipped: exercise.skipped,
        notes: exercise.notes,
      },
    })
    const keepIds = exercise.sets.map((set) => set.id).filter((id): id is string => Boolean(id))
    await tx.setLog.deleteMany({
      where: { sessionExerciseId: exercise.id, ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}) },
    })
    for (const set of exercise.sets) {
      if (set.id) {
        await tx.setLog.upsert({
          where: { id: set.id },
          create: { id: set.id, sessionExerciseId: exercise.id, ...setData(set) },
          update: setData(set),
        })
      } else {
        await tx.setLog.create({ data: { sessionExerciseId: exercise.id, ...setData(set) } })
      }
    }
  }
}

/** Updates the session header (e.g. `activeSeconds`) and returns the ack projection. */
export function updateHeader(
  tx: Prisma.TransactionClient,
  id: string,
  data: { activeSeconds: number },
) {
  return tx.workoutSession.update({ where: { id }, data, select: sessionAckSelect })
}

/** Sets the session status (plus optional completion fields) and returns the ack projection. */
export function setStatus(
  id: string,
  status: SessionStatus,
  data: { completedAt?: Date; activeSeconds?: number },
) {
  return prisma.workoutSession.update({
    where: { id },
    data: { ...data, status },
    select: sessionAckSelect,
  })
}

export type LastPerformance = {
  reps: number | null
  weightKg: number | null
  date: string
}

/**
 * Best set (by weight, then reps) from the most recent completed session that
 * contains `exerciseId` for this user. Returns `null` when there is no history.
 */
export async function findLastPerformance(
  userId: string,
  exerciseId: string,
): Promise<LastPerformance | null> {
  const recent = await prisma.sessionExercise.findFirst({
    where: { exerciseId, session: { userId, status: "completed" } },
    orderBy: { session: { completedAt: "desc" } },
    select: {
      id: true,
      session: { select: { completedAt: true, startedAt: true } },
    },
  })
  if (!recent) return null

  const best = await prisma.setLog.findFirst({
    where: { sessionExerciseId: recent.id, completedAt: { not: null } },
    orderBy: [
      { weightKg: { sort: "desc", nulls: "last" } },
      { reps: { sort: "desc", nulls: "last" } },
    ],
    select: { reps: true, weightKg: true },
  })
  if (!best) return null

  const session = recent.session
  return {
    reps: best.reps,
    weightKg: best.weightKg,
    date: (session.completedAt ?? session.startedAt).toISOString(),
  }
}
