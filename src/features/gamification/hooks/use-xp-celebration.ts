"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { levelForXp } from "@/features/gamification/lib/level"

export const LAST_SEEN_XP_KEY = "gym.lastSeenXp"

function readLastSeenXp(): number | null {
  try {
    const stored = window.localStorage.getItem(LAST_SEEN_XP_KEY)
    if (stored === null) return null
    const value = Number(stored)
    return Number.isNaN(value) ? null : value
  } catch {
    return null
  }
}

function writeLastSeenXp(xp: number): void {
  try {
    window.localStorage.setItem(LAST_SEEN_XP_KEY, String(xp))
  } catch {
    return
  }
}

export function useXpCelebration(xp: number | undefined): void {
  const t = useTranslations("celebration")

  useEffect(() => {
    if (typeof xp !== "number") return

    const previous = readLastSeenXp()

    if (previous === null) {
      writeLastSeenXp(xp)
      return
    }

    if (xp > previous) {
      toast.success(t("xpGained", { count: xp - previous }))
      const previousLevel = levelForXp(previous)
      const currentLevel = levelForXp(xp)
      if (currentLevel > previousLevel) {
        toast.success(t("levelUp", { level: currentLevel }))
      }
    }

    if (xp !== previous) writeLastSeenXp(xp)
  }, [xp, t])
}
