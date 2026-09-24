import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const historySelect = {
  id: true, name: true, startedAt: true, completedAt: true, activeSeconds: true,
  routineId: true, routineDayId: true,
  exercises: { select: { sets: { select: { reps: true, weightKg: true, completedAt: true, isPr: true, type: true } } } },
} satisfies Prisma.WorkoutSessionSelect
export type HistoryRecord = Prisma.WorkoutSessionGetPayload<{ select: typeof historySelect }>

export function listCompletedSessionsPage(
  userId: string,
  args: { limit: number; cursor?: { completedAt: Date; id: string }; from?: Date; to?: Date; routineId?: string },
) {
  return prisma.workoutSession.findMany({
    where: {
      userId, status: "completed", completedAt: { not: null, ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lte: args.to } : {}) },
      ...(args.routineId ? { routineId: args.routineId } : {}),
      ...(args.cursor ? { OR: [{ completedAt: { lt: args.cursor.completedAt } }, { completedAt: args.cursor.completedAt, id: { lt: args.cursor.id } }] } : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: args.limit + 1,
    select: historySelect,
  })
}
