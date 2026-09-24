export const gamificationKeys = {
  all: ["gamification"] as const,
  stats: () => [...gamificationKeys.all, "stats"] as const,
  achievements: () => [...gamificationKeys.all, "achievements"] as const,
}
