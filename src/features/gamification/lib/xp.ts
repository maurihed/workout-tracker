export const STREAK_MILESTONES = [7, 30, 100] as const

export const XP_AWARDS = {
  session: 100,
  weeklyGoal: 150,
  pr: 50,
  streakMilestones: { 7: 100, 30: 500, 100: 2000 } as Record<number, number>,
} as const
