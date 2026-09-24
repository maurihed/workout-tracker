import "server-only"
import { logger } from "@/lib/logger"
import { levelForXp, xpToNextLevel, levelProgress } from "@/features/gamification/lib/level"
import { XP_AWARDS, STREAK_MILESTONES } from "@/features/gamification/lib/xp"
import { epley1rm, selectPrSet } from "@/features/gamification/lib/pr"
import { computeStreak } from "@/features/gamification/lib/streak"
import { weekStart, weeksGoalMet } from "@/features/gamification/lib/week"
import { evaluateAchievements } from "@/features/gamification/lib/achievements"
import { withTransaction } from "@/server/repositories/routine.repository"
import * as profileRepo from "@/server/repositories/profile.repository"
import * as routineRepo from "@/server/repositories/routine.repository"
import * as repos from "@/server/repositories/stats.repository"

export type AchievementDTO = {
  id: string
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  icon: string
  xpReward: number
}

export type StatsDTO = {
  currentStreak: number
  longestStreak: number
  lastHitDate: string | null
  streakFreezes: number
  totalSessions: number
  totalVolumeKg: number
  xp: number
  level: number
  xpToNextLevel: number
  levelProgress: number
  weeklyGoal: { target: number; completed: number; weekStart: string }
}

export async function getStats(userId: string): Promise<StatsDTO> {
  const stats = (await repos.findStatsByUser(userId)) ?? {
    userId,
    currentStreak: 0,
    longestStreak: 0,
    lastHitDate: null,
    streakFreezes: 2,
    totalSessions: 0,
    totalVolumeKg: 0,
    xp: 0,
    level: 1,
  }
  const profile = await profileRepo.findByUserId(userId)
  const timeZone = profile?.timezone ?? "UTC"
  const weekStartsOn = profile?.weekStartsOn ?? 1
  const target = profile?.daysPerWeek ?? 3
  const today = localDate(new Date(), timeZone)
  const start = weekStart(today, weekStartsOn)
  const windowStart = new Date(Date.parse(`${start}T00:00:00Z`) - DAY_MS)
  const windowEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * DAY_MS)
  const weekSessions = await repos.listCompletedAtBetween(userId, windowStart, windowEnd)
  const completed = weekSessions.filter(
    (s) =>
      s.completedAt &&
      localDate(s.completedAt, timeZone) >= start &&
      localDate(s.completedAt, timeZone) <= today,
  ).length
  return {
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    lastHitDate: stats.lastHitDate ? stats.lastHitDate.toISOString().slice(0, 10) : null,
    streakFreezes: stats.streakFreezes,
    totalSessions: stats.totalSessions,
    totalVolumeKg: stats.totalVolumeKg,
    xp: stats.xp,
    level: stats.level,
    xpToNextLevel: xpToNextLevel(stats.xp),
    levelProgress: levelProgress(stats.xp),
    weeklyGoal: { target, completed, weekStart: start },
  }
}

export async function getAchievements(userId: string) {
  const [catalog, unlocked] = await Promise.all([repos.listAchievements(), repos.listUserAchievements(userId)])
  return {
    achievements: catalog.map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      nameEs: a.nameEs,
      description: a.description,
      descriptionEs: a.descriptionEs,
      icon: a.icon,
      xpReward: a.xpReward,
    })),
    unlocked: unlocked.map((u) => ({ achievementId: u.achievementId, unlockedAt: u.unlockedAt.toISOString() })),
  }
}

export async function getUnlockedAchievements(_userId: string, slugs: string[]): Promise<AchievementDTO[]> {
  if (slugs.length === 0) return []
  const rows = await repos.listAchievements()
  return rows
    .filter((a) => slugs.includes(a.slug))
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      nameEs: a.nameEs,
      description: a.description,
      descriptionEs: a.descriptionEs,
      icon: a.icon,
      xpReward: a.xpReward,
    }))
}

const DAY_MS = 86_400_000

function localDate(iso: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(iso)
}

function freezeBalance(createdAt: Date, now: Date): number {
  const months = (now.getUTCFullYear() - createdAt.getUTCFullYear()) * 12 + (now.getUTCMonth() - createdAt.getUTCMonth())
  return Math.min(3, 2 + Math.max(0, months))
}

export async function markPersonalRecords(userId: string, sessionId: string): Promise<void> {
  const session = await repos.findCompletedSessionStats(userId, sessionId)
  if (!session || !session.completedAt) return
  const exerciseIds = session.exercises.map((e) => e.exerciseId).filter((id): id is string => id !== null)
  if (exerciseIds.length === 0) return
  const prior = await repos.listPriorSets(userId, exerciseIds, session.completedAt, sessionId)
  const priorBest = new Map<string, number>()
  for (const set of prior) {
    const id = set.sessionExercise.exerciseId
    const oneRm = epley1rm(set.weightKg, set.reps)
    if (id && oneRm != null) priorBest.set(id, Math.max(priorBest.get(id) ?? 0, oneRm))
  }
  const chosen: string[] = []
  for (const exercise of session.exercises) {
    if (!exercise.exerciseId) continue
    const candidates = exercise.sets.map((set) => ({ id: set.id, reps: set.reps, weightKg: set.weightKg }))
    const prSetId = selectPrSet(candidates, priorBest.get(exercise.exerciseId) ?? null)
    if (prSetId) chosen.push(prSetId)
  }
  if (chosen.length > 0) {
    await withTransaction((tx) => tx.setLog.updateMany({ where: { id: { in: chosen } }, data: { isPr: true } }))
  }
}

export async function recomputeUserStats(userId: string) {
  const [profile, user, sessions, routine] = await Promise.all([
    profileRepo.findByUserId(userId),
    repos.findUserCreatedAt(userId),
    repos.listCompletedSessions(userId),
    routineRepo.findActiveByUser(userId),
  ])
  const timeZone = profile?.timezone ?? "UTC"
  const weekStartsOn = profile?.weekStartsOn ?? 1
  const weeklyGoal = profile?.daysPerWeek ?? 3
  const today = localDate(new Date(), timeZone)
  const scheduledWeekdays = new Set((routine?.days ?? []).map((day) => day.weekday))
  const hasRoutine = scheduledWeekdays.size > 0

  const allDates: string[] = []
  const hitDates: string[] = []
  let totalVolumeKg = 0
  let prCount = 0
  for (const session of sessions) {
    if (!session.completedAt) continue
    const date = localDate(session.completedAt, timeZone)
    allDates.push(date)
    if (session.routineDayId !== null || !hasRoutine) hitDates.push(date)
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.isPr) prCount += 1
        if (set.completedAt && set.reps != null && set.weightKg != null && set.type !== "warmup") totalVolumeKg += set.reps * set.weightKg
      }
    }
  }

  const balance = user ? freezeBalance(user.createdAt, new Date()) : 2
  const streak = computeStreak({ hitDates, scheduledWeekdays, today, freezesAvailable: balance })
  const metWeeks = weeksGoalMet(allDates, weeklyGoal, weekStartsOn)
  const unlockedSlugs = evaluateAchievements({
    totalSessions: sessions.length,
    longestStreak: streak.longest,
    totalVolumeKg,
    prCount,
    weeksGoalMet: metWeeks.length,
  })

  const before = await repos.findStatsByUser(userId)
  const xpBefore = before?.xp ?? 0

  const stats = await withTransaction(async (tx) => {
    const ensure = (data: { key: string; amount: number; reason: Parameters<typeof repos.ensureXpEvent>[1]["reason"]; refType: string; refId: string }) =>
      repos.ensureXpEvent(tx, { userId, ...data })

    for (const session of sessions) {
      await ensure({ key: `session:${session.id}`, amount: XP_AWARDS.session, reason: "session", refType: "session", refId: session.id })
    }
    for (const week of metWeeks) {
      await ensure({ key: `weekly_goal:${userId}:${week}`, amount: XP_AWARDS.weeklyGoal, reason: "weekly_goal", refType: "week", refId: week })
    }
    for (const session of sessions) {
      for (const exercise of session.exercises) {
        for (const set of exercise.sets) {
          if (set.isPr) await ensure({ key: `pr:${set.id}`, amount: XP_AWARDS.pr, reason: "pr", refType: "set", refId: set.id })
        }
      }
    }
    for (const milestone of STREAK_MILESTONES) {
      if (streak.longest >= milestone) {
        await ensure({ key: `streak_milestone:${userId}:${milestone}`, amount: XP_AWARDS.streakMilestones[milestone] ?? 0, reason: "streak_milestone", refType: "streak", refId: String(milestone) })
      }
    }
    const unlocked = await repos.findAchievementIdsBySlugs(unlockedSlugs)
    const newlyUnlocked = unlocked.filter((a) => unlockedSlugs.includes(a.slug))
    if (newlyUnlocked.length > 0) {
      await repos.insertUserAchievements(tx, userId, newlyUnlocked.map((a) => a.id))
      for (const a of newlyUnlocked) {
        await ensure({ key: `achievement:${userId}:${a.id}`, amount: a.xpReward, reason: "achievement", refType: "achievement", refId: a.id })
      }
    }
    const sum = await repos.sumXp(userId, tx)
    const xp = sum._sum.amount ?? 0
    return repos.upsertStats(tx, userId, {
      currentStreak: streak.current,
      longestStreak: streak.longest,
      lastHitDate: streak.lastHitDate ? new Date(`${streak.lastHitDate}T00:00:00Z`) : null,
      streakFreezes: streak.freezesRemaining,
      totalSessions: sessions.length,
      totalVolumeKg,
      xp,
      level: levelForXp(xp),
    })
  })

  return { stats, unlockedSlugs, xpBefore }
}

export async function repairAllStats(): Promise<{ repaired: number }> {
  const users = await repos.listUserIds()
  for (const { id } of users) await recomputeUserStats(id)
  logger.info({ event: "stats.repaired", users: users.length }, "stats repaired")
  return { repaired: users.length }
}
