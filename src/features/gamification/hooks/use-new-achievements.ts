"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { AchievementDTO } from "@/server/services/stats.service"

export const LAST_CELEBRATED_KEY = "gym.lastCelebratedAt"

export type UnlockedAchievement = { achievementId: string; unlockedAt: string }

export type NewAchievement = AchievementDTO & { unlockedAt: string }

function readMarker(): string | null {
  try {
    return window.localStorage.getItem(LAST_CELEBRATED_KEY)
  } catch {
    return null
  }
}

function writeMarker(value: string): void {
  try {
    window.localStorage.setItem(LAST_CELEBRATED_KEY, value)
  } catch {
    return
  }
}

export function useNewAchievements(
  unlocked: UnlockedAchievement[],
  catalog: AchievementDTO[],
): { queue: NewAchievement[]; dismiss: () => void } {
  const [queue, setQueue] = useState<NewAchievement[]>([])
  const seen = useRef(new Set<string>())

  useEffect(() => {
    const marker = readMarker()
    const markerTime = marker ? new Date(marker).getTime() : null
    const byId = new Map(catalog.map((achievement) => [achievement.id, achievement]))

    const fresh = unlocked
      .filter((entry) => !seen.current.has(entry.achievementId))
      .filter(
        (entry) =>
          markerTime === null || new Date(entry.unlockedAt).getTime() > markerTime,
      )
      .sort(
        (a, b) => new Date(a.unlockedAt).getTime() - new Date(b.unlockedAt).getTime(),
      )
      .flatMap((entry) => {
        const achievement = byId.get(entry.achievementId)
        if (!achievement) return []
        seen.current.add(entry.achievementId)
        return [{ ...achievement, unlockedAt: entry.unlockedAt }]
      })

    if (fresh.length > 0) setQueue((prev) => [...prev, ...fresh])
  }, [unlocked, catalog])

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      const [current, ...rest] = prev
      if (current) writeMarker(current.unlockedAt)
      return rest
    })
  }, [])

  return { queue, dismiss }
}
