import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const progressSessionSelect = {
  id: true,
  completedAt: true,
  exercises: {
    select: {
      exerciseId: true,
      nameSnapshot: true,
      sets: {
        select: { reps: true, weightKg: true, type: true, isPr: true, completedAt: true },
      },
      exercise: { select: { primaryMuscles: true, secondaryMuscles: true } },
    },
  },
} satisfies Prisma.WorkoutSessionSelect

export type ProgressSessionRecord = Prisma.WorkoutSessionGetPayload<{ select: typeof progressSessionSelect }>

export function listCompletedSessionsWithMuscles(userId: string, from: Date, to: Date) {
  return prisma.workoutSession.findMany({
    where: { userId, status: "completed", completedAt: { gte: from, lt: to } },
    orderBy: { completedAt: "asc" },
    select: progressSessionSelect,
  })
}

function exerciseProgressSelect(exerciseId: string) {
  return {
    id: true,
    completedAt: true,
    exercises: {
      where: { exerciseId },
      select: {
        nameSnapshot: true,
        sets: {
          select: { reps: true, weightKg: true, type: true, completedAt: true },
          orderBy: { setNumber: "asc" },
        },
      },
    },
  } satisfies Prisma.WorkoutSessionSelect
}

export function listCompletedSessionsForExercise(userId: string, exerciseId: string) {
  return prisma.workoutSession.findMany({
    where: { userId, status: "completed", exercises: { some: { exerciseId } } },
    orderBy: { completedAt: "asc" },
    select: exerciseProgressSelect(exerciseId),
  })
}

export const exerciseNameSelect = {
  id: true,
  name: true,
  nameEs: true,
} satisfies Prisma.ExerciseSelect

export type ExerciseNameRecord = Prisma.ExerciseGetPayload<{ select: typeof exerciseNameSelect }>

export function findExercise(exerciseId: string) {
  return prisma.exercise.findUnique({ where: { id: exerciseId }, select: exerciseNameSelect })
}
