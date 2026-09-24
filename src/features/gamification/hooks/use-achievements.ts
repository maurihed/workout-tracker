"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { AchievementDTO } from "@/server/services/stats.service"
import { gamificationKeys } from "./query-keys"

export type AchievementsResponse = { achievements: AchievementDTO[]; unlocked: { achievementId: string; unlockedAt: string }[] }

export function useAchievements() {
  return useQuery({
    queryKey: gamificationKeys.achievements(),
    queryFn: async () => (await api.get<ApiEnvelope<AchievementsResponse>>("/achievements")).data.data,
  })
}
