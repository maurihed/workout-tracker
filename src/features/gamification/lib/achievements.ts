export type AchievementCriteria = {
  type: "sessions" | "streak" | "volume" | "pr" | "weekly_goal"
  threshold: number
}

export type AchievementDefinition = {
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  icon: string
  criteria: AchievementCriteria
  xpReward: number
  order: number
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { slug: "first_workout", name: "First Workout", nameEs: "Primer entrenamiento", description: "Complete your first workout.", descriptionEs: "Completa tu primer entrenamiento.", icon: "barbell", criteria: { type: "sessions", threshold: 1 }, xpReward: 100, order: 1 },
  { slug: "sessions_10", name: "Getting Consistent", nameEs: "Constancia", description: "Complete 10 workouts.", descriptionEs: "Completa 10 entrenamientos.", icon: "calendar-check", criteria: { type: "sessions", threshold: 10 }, xpReward: 200, order: 2 },
  { slug: "sessions_50", name: "Half Century", nameEs: "Medio centenar", description: "Complete 50 workouts.", descriptionEs: "Completa 50 entrenamientos.", icon: "trophy", criteria: { type: "sessions", threshold: 50 }, xpReward: 500, order: 3 },
  { slug: "streak_7", name: "Week Streak", nameEs: "Racha de una semana", description: "Reach a 7-day streak.", descriptionEs: "Alcanza una racha de 7 días.", icon: "flame", criteria: { type: "streak", threshold: 7 }, xpReward: 100, order: 4 },
  { slug: "streak_30", name: "Month Streak", nameEs: "Racha de un mes", description: "Reach a 30-day streak.", descriptionEs: "Alcanza una racha de 30 días.", icon: "flame", criteria: { type: "streak", threshold: 30 }, xpReward: 500, order: 5 },
  { slug: "volume_100k", name: "100 Tonnes", nameEs: "100 toneladas", description: "Lift 100,000 kg in total.", descriptionEs: "Levanta 100,000 kg en total.", icon: "scales", criteria: { type: "volume", threshold: 100_000 }, xpReward: 200, order: 6 },
  { slug: "volume_1m", name: "Megatonne", nameEs: "Megatonelada", description: "Lift 1,000,000 kg in total.", descriptionEs: "Levanta 1,000,000 kg en total.", icon: "scales", criteria: { type: "volume", threshold: 1_000_000 }, xpReward: 1000, order: 7 },
  { slug: "first_pr", name: "Personal Best", nameEs: "Récord personal", description: "Set your first personal record.", descriptionEs: "Logra tu primer récord personal.", icon: "medal", criteria: { type: "pr", threshold: 1 }, xpReward: 100, order: 8 },
  { slug: "pr_10", name: "Record Breaker", nameEs: "Rompe récords", description: "Set 10 personal records.", descriptionEs: "Logra 10 récords personales.", icon: "medal", criteria: { type: "pr", threshold: 10 }, xpReward: 300, order: 9 },
  { slug: "weekly_goal_4", name: "Goal Crusher", nameEs: "Cumplidor", description: "Meet your weekly goal 4 times.", descriptionEs: "Cumple tu meta semanal 4 veces.", icon: "target", criteria: { type: "weekly_goal", threshold: 4 }, xpReward: 300, order: 10 },
]

export type AchievementStats = {
  totalSessions: number
  longestStreak: number
  totalVolumeKg: number
  prCount: number
  weeksGoalMet: number
}

function meets(stats: AchievementStats, criteria: AchievementCriteria): boolean {
  switch (criteria.type) {
    case "sessions":
      return stats.totalSessions >= criteria.threshold
    case "streak":
      return stats.longestStreak >= criteria.threshold
    case "volume":
      return stats.totalVolumeKg >= criteria.threshold
    case "pr":
      return stats.prCount >= criteria.threshold
    case "weekly_goal":
      return stats.weeksGoalMet >= criteria.threshold
  }
}

export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((achievement) => meets(stats, achievement.criteria)).map((a) => a.slug)
}
