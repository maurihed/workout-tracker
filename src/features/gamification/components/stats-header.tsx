"use client"

import { Flame, Trophy, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAchievements } from "@/features/gamification/hooks/use-achievements"
import { useStats } from "@/features/gamification/hooks/use-stats"

function StatsHeaderSkeleton() {
  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      role="status"
      aria-busy="true"
    >
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-11 w-full" />
    </section>
  )
}

export function StatsHeader() {
  const t = useTranslations("dashboard.stats")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data, isLoading, isError, refetch } = useStats()
  const achievements = useAchievements()

  if (isLoading) return <StatsHeaderSkeleton />

  if (isError || !data) {
    return (
      <section
        className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-4 text-center"
        role="alert"
      >
        <WarningCircle
          className="text-destructive size-6"
          weight="fill"
          aria-hidden="true"
        />
        <span className="text-muted-foreground text-sm">{tCommon("error")}</span>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => refetch()}
        >
          {tCommon("retry")}
        </Button>
      </section>
    )
  }

  const catalogById = new Map(
    (achievements.data?.achievements ?? []).map((a) => [a.id, a]),
  )
  const badges = (achievements.data?.unlocked ?? [])
    .slice()
    .sort((a, b) => Date.parse(b.unlockedAt) - Date.parse(a.unlockedAt))
    .flatMap((u) => {
      const badge = catalogById.get(u.achievementId)
      return badge ? [badge] : []
    })
    .slice(0, 5)

  return (
    <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Flame className="size-5 text-orange-500" weight="fill" aria-hidden="true" />
          {t("streak", { count: data.currentStreak })}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("longest", { count: data.longestStreak })}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("level", { level: data.level })}</span>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full"
            style={{ width: `${Math.round(data.levelProgress * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {t("weeklyGoal", {
            completed: data.weeklyGoal.completed,
            target: data.weeklyGoal.target,
          })}
        </span>
        {badges.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Trophy className="size-4" weight="fill" aria-hidden="true" />
            {badges.length}
          </span>
        ) : null}
      </div>

      {badges.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t("badges")}</span>
          <ul className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <li
                key={badge.id}
                className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
              >
                <Trophy className="size-3" weight="fill" aria-hidden="true" />
                {locale === "es" ? badge.nameEs : badge.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button asChild variant="outline" className="h-11">
        <Link href={`/${locale}/progress`}>{t("viewHistory")}</Link>
      </Button>
    </section>
  )
}
