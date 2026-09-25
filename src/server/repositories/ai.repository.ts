import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import type { HistorySession } from "@/features/ai/lib/history"
import { createWithDays, withTransaction } from "@/server/repositories/routine.repository"

export function createJob(userId: string, input: Prisma.InputJsonValue) {
  return prisma.aiJob.create({
    data: { userId, input, status: "queued" },
  })
}

export function findJob(userId: string, id: string) {
  return prisma.aiJob.findFirst({ where: { id, userId } })
}

export function findJobById(id: string) {
  return prisma.aiJob.findUnique({ where: { id } })
}

export function listJobs(userId: string) {
  return prisma.aiJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
}

export function markRunning(id: string) {
  return prisma.aiJob.updateMany({
    where: { id, status: "queued" },
    data: {
      status: "running",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  })
}

export function markSucceeded(
  id: string,
  result: Prisma.InputJsonValue,
  model: string | null,
  promptVersion: string,
) {
  return prisma.aiJob.updateMany({
    where: { id, status: "running" },
    data: {
      result,
      model,
      promptVersion,
      status: "succeeded",
      finishedAt: new Date(),
    },
  })
}

export function markFailed(id: string, error: string) {
  return prisma.aiJob.updateMany({
    where: { id, status: { in: ["queued", "running"] } },
    data: { status: "failed", error, finishedAt: new Date() },
  })
}

export function markCancelled(id: string) {
  return prisma.aiJob.updateMany({
    where: { id, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", finishedAt: new Date() },
  })
}

export function reclaimStaleRunning(id: string, staleBefore: Date) {
  return prisma.aiJob.updateMany({
    where: { id, status: "running", startedAt: { lt: staleBefore } },
    data: {
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  })
}

export function countRecentJobs(userId: string, since: Date) {
  return prisma.aiJob.count({
    where: {
      userId,
      createdAt: { gte: since },
      status: { in: ["queued", "running", "succeeded"] },
    },
  })
}

export function listCatalogEntries() {
  return prisma.exercise.findMany({
    where: { isCustom: false },
    select: { id: true, sourceId: true, name: true, primaryMuscles: true },
    orderBy: { sourceId: "asc" },
  })
}

export async function listRecentExerciseHistory(
  userId: string,
  options: { since: Date; maxSessions: number },
): Promise<HistorySession[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: { userId, status: "completed", completedAt: { gte: options.since } },
    orderBy: { completedAt: "desc" },
    take: options.maxSessions,
    select: {
      completedAt: true,
      exercises: {
        where: { completed: true, skipped: false },
        select: {
          exerciseId: true,
          nameSnapshot: true,
          sets: {
            where: {
              type: "working",
              completedAt: { not: null },
              weightKg: { not: null },
              reps: { not: null },
            },
            select: { weightKg: true, reps: true },
          },
        },
      },
    },
  })

  return sessions.flatMap((session) =>
    session.completedAt
      ? [
          {
            completedAt: session.completedAt.toISOString(),
            exercises: session.exercises
              .filter((exercise) => exercise.sets.length > 0)
              .map((exercise) => ({
                exerciseId: exercise.exerciseId,
                nameSnapshot: exercise.nameSnapshot,
                sets: exercise.sets.map((set) => ({
                  weightKg: set.weightKg ?? 0,
                  reps: set.reps ?? 0,
                })),
              })),
          },
        ]
      : [],
  )
}

export function findRoutineByJobId(userId: string, aiJobId: string) {
  return prisma.routine.findFirst({
    where: { userId, aiJobId },
    select: { id: true },
  })
}

export type AiRoutineWriteInput = {
  aiJobId: string
  name: string
  goal: Exclude<Prisma.RoutineUncheckedCreateInput["goal"], undefined>
  source: "ai" | "template"
  days: Prisma.RoutineDayUncheckedCreateWithoutRoutineInput[]
}

export function createRoutineFromJob(userId: string, data: AiRoutineWriteInput) {
  return withTransaction((tx) =>
    createWithDays(tx, {
      userId,
      name: data.name,
      description: null,
      goal: data.goal,
      source: data.source,
      aiJobId: data.aiJobId,
      isActive: false,
      days: { create: data.days },
    }),
  )
}
