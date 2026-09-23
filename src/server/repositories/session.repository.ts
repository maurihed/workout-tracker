import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma, SessionStatus, SetType } from "@/generated/prisma/client"

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

const ownedDaySelect = {
  id: true,
  weekday: true,
  label: true,
  order: true,
  routine: { select: { id: true, name: true, nameEs: true } },
  exercises: {
    orderBy: { order: "asc" },
    select: {
      exerciseId: true,
      customName: true,
      order: true,
      targetSets: true,
      targetReps: true,
      restSeconds: true,
      targetWeightKg: true,
      timerType: true,
      workSeconds: true,
      rounds: true,
      exercise: { select: { name: true, nameEs: true } },
    },
  },
} satisfies Prisma.RoutineDaySelect

export type OwnedDay = Prisma.RoutineDayGetPayload<{ select: typeof ownedDaySelect }>

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

/** Loads a routine day only when its parent routine belongs to `userId`. */
export function findOwnedDayWithExercises(userId: string, routineDayId: string) {
  return prisma.routineDay.findFirst({
    where: { id: routineDayId, routine: { userId } },
    select: ownedDaySelect,
  })
}

/**
 * Freezes the routine/day identity and each exercise's display name and
 * prescription, so editing or deleting the routine mid-session never changes a
 * running workout or its history.
 */
function buildSnapshot(day: OwnedDay) {
  return {
    routineId: day.routine.id,
    routineDayId: day.id,
    name: day.routine.name,
    nameEs: day.routine.nameEs,
    weekday: day.weekday,
    label: day.label,
    exercises: day.exercises.map((exercise) => ({
      order: exercise.order,
      name: exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise",
      nameEs: exercise.exercise?.nameEs ?? null,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      restSeconds: exercise.restSeconds,
      targetWeightKg: exercise.targetWeightKg,
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      rounds: exercise.rounds,
    })),
  } satisfies Prisma.InputJsonObject
}

/**
 * Parses the numeric part of a prescription (`"10"` → `10`). Ranges (`"8-12"`),
 * AMRAP, and other free-form text yield `null` so the set stays blank for the
 * user to fill in.
 */
export function parseTargetReps(targetReps: string | null): number | null {
  if (!targetReps) return null
  const trimmed = targetReps.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

/** Max seeded rows per exercise, matching the set-input schema's `max(50)`. */
const MAX_SEEDED_SETS = 50

/** Builds the prescribed `SetLog` rows for a routine exercise (all uncompleted). */
function buildSeededSets(exercise: OwnedDay["exercises"][number]) {
  const count = Math.min(Math.max(exercise.targetSets ?? 0, 0), MAX_SEEDED_SETS)
  const reps = parseTargetReps(exercise.targetReps)
  return Array.from({ length: count }, (_, index) => ({
    setNumber: index + 1,
    type: "working" as const,
    reps,
    weightKg: exercise.targetWeightKg,
  }))
}

/**
 * Creates the session (with its snapshot), copied exercise rows, and the
 * prescribed `SetLog` rows in one write, so the runner opens with the user's
 * target sets already in place.
 */
export function createSessionWithExercises(
  tx: Prisma.TransactionClient,
  { userId, day }: { userId: string; day: OwnedDay },
) {
  return tx.workoutSession.create({
    data: {
      userId,
      routineId: day.routine.id,
      routineDayId: day.id,
      name: day.label ?? day.routine.name,
      status: "in_progress",
      snapshot: buildSnapshot(day),
      exercises: {
        create: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          order: exercise.order,
          nameSnapshot:
            exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise",
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          restSeconds: exercise.restSeconds,
          timerType: exercise.timerType,
          workSeconds: exercise.workSeconds,
          rounds: exercise.rounds,
          sets: { create: buildSeededSets(exercise) },
        })),
      },
    },
    select: sessionSelect,
  })
}

export type SetLogWriteInput = {
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

/**
 * Replaces every submitted exercise's sets wholesale, matching rows by their
 * server-generated `SessionExercise.id`. Also applies the mutable exercise
 * fields so a swap (`exerciseId`/`nameSnapshot`) is persisted. Ids that do not
 * belong to the session are ignored rather than trusted.
 */
export async function replaceSets(
  tx: Prisma.TransactionClient,
  sessionId: string,
  exercises: SessionExerciseWriteInput[],
) {
  const owned = await tx.sessionExercise.findMany({
    where: { sessionId },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((row) => row.id))

  for (const exercise of exercises) {
    if (!ownedIds.has(exercise.id)) continue
    await tx.setLog.deleteMany({ where: { sessionExerciseId: exercise.id } })
    await tx.sessionExercise.update({
      where: { id: exercise.id },
      data: {
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
        completed: exercise.completed,
        skipped: exercise.skipped,
        notes: exercise.notes,
        sets: {
          create: exercise.sets.map((set) => ({
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
      },
    })
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
