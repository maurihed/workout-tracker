"use client"

import { useTranslations } from "next-intl"

import { formatElapsed } from "@/features/workouts/lib/format-time"

type RunnerHeaderProps = {
  elapsedSeconds: number
  index: number
  total: number
  completedSets: number
  totalSets: number
}

export function RunnerHeader({
  elapsedSeconds,
  index,
  total,
  completedSets,
  totalSets,
}: RunnerHeaderProps) {
  const t = useTranslations("runner")
  const percent =
    totalSets > 0 ? Math.min(100, Math.round((completedSets / totalSets) * 100)) : 0

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-lg font-bold tabular-nums">
          {formatElapsed(elapsedSeconds)}
        </span>
        <span className="text-muted-foreground text-sm">
          {t("exerciseOf", { index: index + 1, total })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSets}
        aria-valuenow={completedSets}
        aria-label={t("progress")}
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </header>
  )
}
