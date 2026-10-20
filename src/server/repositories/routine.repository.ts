import "server-only"
import { prisma } from "@/lib/prisma"
import { Prisma, type Goal, type TimerType } from "@/generated/prisma/client"
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
import {
  normalizeRoutineSetTargets,
  parseSetTargets,
} from "@/features/routines/lib/set-targets"

export const routineSelect = {
  id: true,
  name: true,
  nameEs: true,
  description: true,
  descriptionEs: true,
  goal: true,
  source: true,
  isActive: true,
  days: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      weekday: true,
      label: true,
      order: true,
      exercises: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          exerciseId: true,
          customName: true,
          targetSets: true,
          targetReps: true,
          restSeconds: true,
          targetWeightKg: true,
          setTargets: true,
          timerType: true,
          workSeconds: true,
          rounds: true,
          notes: true,
          exercise: {
            select: {
              id: true,
              name: true,
              nameEs: true,
              images: true,
              instructions: true,
              isCustom: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.RoutineSelect

type NormalizedExercise<E> = {
  [K in keyof E]: K extends "setTargets" ? RoutineSetTarget[] | null : E[K]
}

type NormalizedDay<D> = {
  [K in keyof D]: K extends "exercises"
    ? D[K] extends (infer E)[] ? NormalizedExercise<E>[] : never
    : D[K]
}

type NormalizedRoutine<T extends { days: { exercises: { setTargets: unknown }[] }[] }> = {
  [K in keyof T]: K extends "days" ? NormalizedDay<T[K][number]>[] : T[K]
}

function normalizeRoutine<T extends { days: { exercises: { setTargets: unknown }[] }[] }>(
  routine: T,
): NormalizedRoutine<T> {
  return normalizeRoutineSetTargets(routine) as NormalizedRoutine<T>
}

export async function findActiveByUser(userId: string) {
  const routine = await prisma.routine.findFirst({
    where: { userId, isActive: true },
    select: routineSelect,
  })
  return routine ? normalizeRoutine(routine) : null
}

/**
 * Runs `fn` inside a Prisma interactive transaction. Keeps `prisma.$transaction`
 * out of the service layer so the service stays repository-agnostic.
 */
export function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn)
}

/** Deactivates any routine the user currently has active. */
export function deactivateActive(tx: Prisma.TransactionClient, userId: string) {
  return tx.routine.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  })
}

/** Creates the routine (with nested days/exercises) and returns the DTO. */
export async function createWithDays(
  tx: Prisma.TransactionClient,
  data: Prisma.RoutineUncheckedCreateInput,
) {
  const routine = await tx.routine.create({ data, select: routineSelect })
  return normalizeRoutine(routine)
}

/**
 * Sets `onboardedAt` only when it is still null, so a re-pick never overwrites
 * the original completion timestamp. Returns the `updateMany` count so the
 * caller can tell whether this call completed onboarding.
 */
export function setOnboardedAtIfNull(tx: Prisma.TransactionClient, userId: string) {
  return tx.profile.updateMany({
    where: { userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  })
}

/** Resolves catalog exercise ids for the given `sourceId`s. */
export function findExercisesBySourceIds(
  tx: Prisma.TransactionClient,
  sourceIds: string[],
) {
  return tx.exercise.findMany({
    where: { sourceId: { in: sourceIds } },
    select: { id: true, sourceId: true },
  })
}

export type RoutineSummary = {
  id: string
  name: string
  description: string | null
  source: "manual" | "ai" | "template"
  isActive: boolean
  updatedAt: string
  dayCount: number
  exerciseCount: number
}

export async function listByUser(userId: string): Promise<RoutineSummary[]> {
  const rows = await prisma.routine.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      source: true,
      isActive: true,
      updatedAt: true,
      _count: { select: { days: true } },
      days: { select: { _count: { select: { exercises: true } } } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
    dayCount: r._count.days,
    exerciseCount: r.days.reduce((sum, d) => sum + d._count.exercises, 0),
  }))
}

/** Ownership-scoped lookup for a single routine DTO. */
export async function findByIdForUser(userId: string, id: string) {
  const routine = await prisma.routine.findFirst({
    where: { id, userId },
    select: routineSelect,
  })
  return routine ? normalizeRoutine(routine) : null
}

export type RoutineHeaderInput = {
  name: string
  description: string | null
  goal: Goal | null
}

export type RoutineDayWriteInput = {
  weekday: number
  label: string | null
  order: number
  exercises: {
    exerciseId: string | null
    order: number
    targetSets: number
    targetReps: string
    restSeconds: number
    targetWeightKg: number | null
    setTargets: RoutineSetTarget[] | null
    timerType: TimerType
    workSeconds: number | null
    rounds: number | null
    notes: string | null
  }[]
}

export type RoutineDuplicateSource = {
  id: string
  name: string
  description: string | null
  goal: Goal | null
  days: RoutineDayWriteInput[]
}

/** Creates an empty, inactive manual routine. */
export async function createBlank(userId: string, data: RoutineHeaderInput) {
  const routine = await prisma.routine.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      goal: data.goal,
      source: "manual",
      isActive: false,
    },
    select: routineSelect,
  })
  return normalizeRoutine(routine)
}

/**
 * Deletes every existing day (the cascade removes their exercises) and then
 * recreates the supplied days, updating the header in the same transaction.
 * Must run inside a transaction so a failure never partially writes. Returns
 * the fresh DTO so callers do not re-read an uncommitted row.
 */
export async function replaceDays(
  tx: Prisma.TransactionClient,
  routineId: string,
  days: RoutineDayWriteInput[],
  header: RoutineHeaderInput,
) {
  await tx.routineDay.deleteMany({ where: { routineId } })
  const routine = await tx.routine.update({
    where: { id: routineId },
    data: {
      name: header.name,
      // 2A exposes a single user-entered name/description, so any template
      // localization is cleared to let the localized fields fall back to the
      // freshly written `name`/`description`.
      nameEs: null,
      descriptionEs: null,
      description: header.description,
      goal: header.goal,
      days: {
        create: days.map((d) => ({
          weekday: d.weekday,
          label: d.label,
          order: d.order,
          exercises: {
            create: d.exercises.map((e) => ({
              exerciseId: e.exerciseId,
              order: e.order,
              targetSets: e.targetSets,
              targetReps: e.targetReps,
              restSeconds: e.restSeconds,
              targetWeightKg: e.targetWeightKg,
              setTargets: e.setTargets ?? Prisma.DbNull,
              timerType: e.timerType,
              workSeconds: e.workSeconds,
              rounds: e.rounds,
              notes: e.notes,
            })),
          },
        })),
      },
    },
    select: routineSelect,
  })
  return normalizeRoutine(routine)
}

/** Deletes a routine owned by `userId`; returns the affected row count. */
export async function deleteByIdForUser(userId: string, id: string): Promise<number> {
  const result = await prisma.routine.deleteMany({ where: { id, userId } })
  return result.count
}

/** Deactivates the user's current routine then activates `id`. */
export async function setActive(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  await deactivateActive(tx, userId)
  const routine = await tx.routine.update({
    where: { id },
    data: { isActive: true },
    select: routineSelect,
  })
  return normalizeRoutine(routine)
}

/** Reads the full source routine graph used to deep-copy a duplicate. */
export async function duplicateSource(
  userId: string,
  id: string,
): Promise<RoutineDuplicateSource | null> {
  const source = await prisma.routine.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      days: {
        orderBy: { order: "asc" },
        select: {
          weekday: true,
          label: true,
          order: true,
          exercises: {
            orderBy: { order: "asc" },
            select: {
              exerciseId: true,
              order: true,
              targetSets: true,
              targetReps: true,
              restSeconds: true,
              targetWeightKg: true,
              setTargets: true,
              timerType: true,
              workSeconds: true,
              rounds: true,
              notes: true,
            },
          },
        },
      },
    },
  })
  if (!source) return null
  for (const day of source.days) {
    for (const exercise of day.exercises) {
      ;(exercise as { setTargets: RoutineSetTarget[] | null }).setTargets =
        parseSetTargets(exercise.setTargets)
    }
  }
  return source as unknown as RoutineDuplicateSource
}
