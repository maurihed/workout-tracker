import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma, XpReason } from "@/generated/prisma/client"

export const statsSelect = {
  userId: true,
  currentStreak: true,
  longestStreak: true,
  lastHitDate: true,
  streakFreezes: true,
  totalSessions: true,
  totalVolumeKg: true,
  xp: true,
  level: true,
} satisfies Prisma.UserStatsSelect
export type StatsRecord = Prisma.UserStatsGetPayload<{ select: typeof statsSelect }>

export function findStatsByUser(userId: string) {
  return prisma.userStats.findUnique({ where: { userId }, select: statsSelect })
}

export function findUserCreatedAt(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
}

export type StatsUpsert = {
  currentStreak: number
  longestStreak: number
  lastHitDate: Date | null
  streakFreezes: number
  totalSessions: number
  totalVolumeKg: number
  xp: number
  level: number
}

export function upsertStats(tx: Prisma.TransactionClient, userId: string, data: StatsUpsert) {
  return tx.userStats.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: statsSelect })
}

export const completedSessionStatsSelect = {
  id: true,
  routineDayId: true,
  completedAt: true,
  exercises: {
    select: {
      exerciseId: true,
      sets: { select: { id: true, reps: true, weightKg: true, isPr: true, type: true, completedAt: true } },
    },
  },
} satisfies Prisma.WorkoutSessionSelect
export type CompletedSessionStats = Prisma.WorkoutSessionGetPayload<{ select: typeof completedSessionStatsSelect }>

export function listCompletedSessions(userId: string) {
  return prisma.workoutSession.findMany({
    where: { userId, status: "completed", completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    select: completedSessionStatsSelect,
  })
}

export function listPriorSets(userId: string, exerciseIds: string[], before: Date, excludeSessionId: string) {
  return prisma.setLog.findMany({
    where: {
      sessionExercise: {
        exerciseId: { in: exerciseIds },
        session: { userId, status: "completed", completedAt: { lt: before, not: null }, id: { not: excludeSessionId } },
      },
      completedAt: { not: null },
    },
    select: { reps: true, weightKg: true, sessionExercise: { select: { exerciseId: true } } },
  })
}

export function ensureXpEvent(
  tx: Prisma.TransactionClient,
  data: { userId: string; key: string; amount: number; reason: XpReason; refType: string; refId: string },
) {
  return tx.xpEvent.upsert({ where: { key: data.key }, create: data, update: {} })
}

export function sumXp(userId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } })
}

export function findAchievementIdsBySlugs(slugs: string[]) {
  return prisma.achievement.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, xpReward: true } })
}

export function listUserAchievements(userId: string) {
  return prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, unlockedAt: true } })
}

export function listAchievements() {
  return prisma.achievement.findMany({ orderBy: { order: "asc" } })
}

export function insertUserAchievements(tx: Prisma.TransactionClient, userId: string, ids: string[]) {
  return tx.userAchievement.createMany({ data: ids.map((achievementId) => ({ userId, achievementId })), skipDuplicates: true })
}

export function listUserIds() {
  return prisma.user.findMany({ select: { id: true } })
}
