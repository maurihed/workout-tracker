import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

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
          timerType: true,
          workSeconds: true,
          rounds: true,
          notes: true,
          exercise: { select: { id: true, name: true, nameEs: true, images: true } },
        },
      },
    },
  },
} satisfies Prisma.RoutineSelect

export function findActiveByUser(userId: string) {
  return prisma.routine.findFirst({ where: { userId, isActive: true }, select: routineSelect })
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
export function createWithDays(
  tx: Prisma.TransactionClient,
  data: Prisma.RoutineUncheckedCreateInput,
) {
  return tx.routine.create({ data, select: routineSelect })
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
  updatedAt: Date
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
    updatedAt: r.updatedAt,
    dayCount: r._count.days,
    exerciseCount: r.days.reduce((sum, d) => sum + d._count.exercises, 0),
  }))
}
