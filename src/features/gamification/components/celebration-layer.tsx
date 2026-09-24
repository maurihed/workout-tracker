"use client"

import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAchievements } from "@/features/gamification/hooks/use-achievements"
import { useNewAchievements } from "@/features/gamification/hooks/use-new-achievements"
import { useStats } from "@/features/gamification/hooks/use-stats"
import { useXpCelebration } from "@/features/gamification/hooks/use-xp-celebration"

export function CelebrationLayer() {
  const t = useTranslations("celebration")
  const locale = useLocale()
  const stats = useStats()
  const achievements = useAchievements()

  useXpCelebration(stats.data?.xp)

  const { queue, dismiss } = useNewAchievements(
    achievements.data?.unlocked ?? [],
    achievements.data?.achievements ?? [],
  )

  const current = queue[0]
  if (!current) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("badgeUnlocked")}</DialogTitle>
          <DialogDescription>
            {locale === "es" ? current.nameEs : current.name}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" className="h-11" onClick={dismiss}>
            {t("continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
