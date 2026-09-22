import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const routineSelect = {
  id: true,
  name: true,
  description: true,
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
